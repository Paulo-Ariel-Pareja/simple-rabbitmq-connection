/* eslint-disable no-param-reassign */
/* eslint-disable dot-notation */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-plusplus */
/* eslint-disable no-underscore-dangle */
/* eslint-disable security/detect-object-injection */
const amqp = require('amqp-connection-manager');

const manualConfigDefaut = {
  id: process.env.RABBIT_ID_MANUAL || 'manualChannel',
  queues: [
    {
      id: process.env.RABBIT_ID_MANUAL || 'manualChannel',
      type: process.env.RABBIT_TYPE_MANUAL || 'fanout',
      name: process.env.RABBIT_NAME_MANUAL || 'manual_treatment',
      json: process.env.RABBIT_JSON_MANUAL || true,
      retry: process.env.RABBIT_RETRY_MANUAL ? Number(process.env.RABBIT_RETRY) : 2,
      retry_timeout: process.env.RABBIT_RETRY_TIMEOUT_MANUAL || 5000
    },
  ],
};

const getConnection = (data) => {
  return new Promise((resolve, reject) => {
    if (!data.connObject) {
      const message = 'Connection object is required';
      console.error(message);
      reject(Error(message));
    }
    data.eventConnection = amqp.connect([`${data.connObject.protocol}://${data.connObject.user}:${data.connObject.pass}@${data.connObject.server}:${data.connObject.port}${data.connObject.vhost}`], { json: true });
    data.eventConnection.on('connect', () => {
      console.info('Rabbitmq is connected');
      resolve(data.eventConnection);
    });
    data.eventConnection.on('disconnect', (params) => {
      data.eventConnection = null;
      console.error(params.err.message);
      setTimeout(() => {
        data.init();
      }, 5000);
    });
    data.eventConnection.on('error', (error) => {
      data.eventConnection = null;
      console.error(error.message);
      setTimeout(() => {
        data.init();
      }, 5000);
    });
    if (data.eventConnection) {
      console.info('Connection will be established');
      return Promise.resolve(data.eventConnection);
    }
    console.error('Connection not established');
  });
};

const getTimeout = (channel) => {
  const timeout = channel.retry_timeout ? channel.retry_timeout : 5000;
  return timeout;
};

class SimpleRabbitmqConnection {
  constructor(connObject, configs) {
    this._this = this;
    this.connObject = connObject;
    this.channels = {};
    this.configs = configs;
  }
  async init() {
    const connection = await getConnection(this);
    if (this.eventConnection) {
      console.info('Connection will be established');
    }

    if (!this.configs['manual']) {
      this.configs.manual = manualConfigDefaut;
    }
    this.createChannels(this.configs);
    const keyObject = Object.keys(this.configs);
    for (let index = 0; index < keyObject.length; index++) {
      const key = keyObject[index];
      if (key !== 'consumer') {
        await this.createQueues(this.configs[key].id, this.configs[key].queues);
        if (this.configs[key].exchange) {
          await this.createExchanges([this.configs[key].exchange]);
          await this.bind(
            this.configs[key].id,
            this.configs[key].queues,
            this.configs[key].exchange.name
          );
        }
      }
    }
    return connection;
  }

  createExchanges(exchangeList) {
    Object.keys(exchangeList).forEach((key) => {
      const channelWrapper = this.channels[exchangeList[key].channelId];
      channelWrapper.addSetup((channel) => {
        return Promise.all([
          channel.assertExchange(
            exchangeList[key].name,
            exchangeList[key].type,
            exchangeList[key].options
          )
        ]);
      });
    });
  }
  createQueues(channelId, queueList) {
    const channelWrapper = this.channels[channelId];
    channelWrapper.addSetup((channel) => {
      return Promise.all([
        Object.keys(queueList).forEach((queueIndex) => {
          channel.assertQueue(
            queueList[queueIndex].name,
            queueList[queueIndex].option
          );
        })
      ]);
    });
  }
  createChannels(channelList) {
    Object.keys(channelList).forEach((key) => {
      this.channels[channelList[key].id] =
        this.eventConnection.createChannel({
          json: channelList[key].json
        });
    });
    return this.channels;
  }
  getChannel(channelName) {
    if (this.eventConnection) {
      return Promise.resolve(this.channels[channelName]);
    }
    return new Promise((resolve, reject) => {
      getConnection(this).then(() => {
        resolve(this.channels[channelName]);
      }).catch((error) => {
        console.error(`error getting channel ${channelName}`);
        reject(new Error(error));
      });
    });
  }
  bind(channelName, queueList, exchange) {
    const channelWrapper = this.channels[channelName];
    channelWrapper.addSetup((channel) => {
      return Promise.all([
        queueList.forEach((queue) => {
          const bindingKey = queue.bindingKey || '';
          channel.bindQueue(queue.name, exchange, bindingKey);
        })
      ]);
    });
  }
  rabbitPublishEvent(exchange, channelName, routingKey, content, options) {
    return this.getChannel(channelName).then((channel) => {
      channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(content)), options);
    });
  }
  rabbitSendEvent(data, queue, channelName, options) {
    return this.getChannel(channelName).then((channel) => {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), options);
    });
  }
  async setupQueuesConsumer(callback) {
    if (!this.configs.consumer) {
      const message = 'Config CONSUMER not exist, fix it!';
      console.error(message);
      throw Error(message);
    }
    const self = this._this;
    await this.createQueues(this.configs.consumer.id, this.configs.consumer.queues);
    const channelWrapper = await this.getChannel(this.configs.consumer.id);
    const queueList = this.configs.consumer.queues;
    channelWrapper.addSetup((channel) => {
      return Promise.all([
        channel.prefetch(1),
        queueList.forEach((queue) => {
          channel.consume(queue.name, async (data) => {
            try {
              await callback(data);
              channel.ack(data);
              return 'Message Recived';
            } catch (e) {
              try {
                const dataRaw = JSON.parse(data.content);
                const retry = data.properties.headers['x-queue-retry'] ? data.properties.headers['x-queue-retry'] : 0;
                if ((retry < queue.retry) || queue.retry === -1) {
                  self.retryAgain(dataRaw, queue, data.properties.headers);
                } else {
                  self.manualTreatment(dataRaw, this.configs, data.properties.headers);
                }
                channel.ack(data);
                return undefined;
              } catch (error) {
                channel.ack(data);
                return undefined;
              }
            }
          });
        })
      ]);
    });
  }
  retryAgain(data, config, headers = {}) {
    const count = headers['x-queue-retry'];
    const retry = count ? (count + 1) : 1;
    const newCount = { 'x-queue-retry': retry };
    const newHeaders = {
      ...headers,
      ...newCount
    };
    this.requeue(data, config, newHeaders);
  }
  manualTreatment(message, config, headers = {}) {
    const manualChannel = config.manual;
    const options = {
      headers
    };
    const timeout = getTimeout(manualChannel);
    setTimeout(() => {
      this.rabbitSendEvent(message, manualChannel.queues[0].name, manualChannel.id, options);
    }, timeout);
  }
  requeue(message, config, headers = {}) {
    const options = {
      headers
    };
    const timeout = getTimeout(config);
    setTimeout(() => {
      this.rabbitSendEvent(message, config.name, config.id, options);
    }, timeout);
  }
}

exports.SimpleRabbitmqConnection = SimpleRabbitmqConnection;
