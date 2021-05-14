# simple-rabbitmq-connection - Simple rabbitmq connection

<a href="www.npmjs.com/package/simple-rabbitmq-connection/"><img src="https://nodei.co/npm/simple-rabbitmq-connection.png?downloads=true"></a>

## Conexión a rabbit

La libreria se encargara de inicializar los canales, crear las queues y los bindeos correspondientes mediante el metodo "init()".
Para los casos de consumers, debe haber un objeto de configuracion llamado "consumer", la queue manual se generara de forma automatica la cual se encargara de desechar los mensajes que fallen antes del ack segun la politica de reintentos seteada (con posibilidad de sobreescrirla).

## Enviar un mensaje
### rabbitSendEvent
```
rabbitSendEvent(message, queueName, channelName, options)
```

### rabbitPublishEvent
```
rabbitPublishEvent(exchangeName, channelName, routingKey, message, options)
```

## Configuraciones
### Conexion
```
  connectionObject: {
    user: 'guest',
    pass: 'guest',
    server: '127.0.0.1',
    port: '5672',
    vhost: '/',
    protocol: 'amqp'
  },
```
### Consumer (nombre del objeto 'consumer' es obligatorio)
```
  consumer: {
    id: 'consumerChannel',
    queues: [
      {
        id: 'consumerChannel',
        type: 'fanout',
        name: 'queue_consumer',
        json: true,
        retry: 2,
        retry_timeout: 5000
      },
    ],
  },
      
  ```
  #### Politica de reintentos consumer:
```
La propiedad "retry" del consumer debe ser un numero. En caso que no se requiera una politica de reintento setearla en 0. Para los casos que se quiere reintentar de forma indefinida setearla en -1
```

  ### Queues y exchanges (puede ser un array de queues y pueden o no tener mas informacion, por ejemplo bindingKey). No es obligatorio tener un exchange declarado
```
  exampleQueue: {
    id: 'example_channel',
    queues: [
      {
        name: 'queue_test',
        bindingKey: 'bindingKeyExample'
      },
    ],
    exchange: {
      channelId: 'example_channel',
      name: 'exchange_example',
      type: 'x-delayed-message',
      options: {
        autoDelete: false,
        durable: true,
        passive: true,
        arguments: { 'x-delayed-type': 'direct' }
      }
    }
  },
      
  ```

  #### Nota al poner un bind entre un exchange y una o varias queues:
```
La property "channelId" exchange debe coincidir con la property id del objeto que la contiene. En el ejemplo anterior seria "example_channel".
```

  ### Ejemplo config completo
```
  conexionObject: {
    user: 'guest',
    pass: 'guest',
    server: '127.0.0.1',
    port: '5672',
    vhost: '/',
    protocol: 'amqp'
  },
  config: {
    consumer: {
      id: 'consumerChannel',
      queues: [
        {
          id: 'consumerChannel',
          type: 'fanout',
          name: 'queue_consumer',
          json: true,
          retry: 2,
          retry_timeout: 5000
        },
      ],
    },
    exampleQueue: {
      id: 'example_channel',
      queues: [
        {
          name: 'queue_test',
          bindingKey: 'bindingKeyExample'
        },
      ],
      exchange: {
        channelId: 'example_channel',
        name: 'exchange_example',
        type: 'x-delayed-message',
        options: {
          autoDelete: false,
          durable: true,
          passive: true,
          arguments: { 'x-delayed-type': 'direct' }
        }
      }
    },
    anotherExampleQueue: {
      id: 'another_example_channel',
      queues: [
        {
          name:  'queue_test_2'
        },
      ],
      exchange: {
        channelId: 'another_example_channel',
        name: 'another_exchange_example',
        type: 'fanout'
      }
    },
  }
```
## Inicializar rabbit:
```
const src = require('simple-rabbitmq-conection');

const rabbitInstance = async () => {
  const rabbit = new src.RabbitmqConnection(
    config.conexionObject, // objeto de conexion
    config.config // objeto de configuracion
  );
  await rabbit.init(); 

  // caso de que se utilice un consumer, indicar quien recibe el mensaje
  await rabbit.setupQueuesConsumer(
    middleware.initialMiddleware
  );

  return rabbit;
}
```
### - Ejemplo implementar mensaje:
```
const anotherExample = congig.anotherExampleQueue;

const sendMessage = function () {
  this.send = async (data, headers) => {
    try {
      const sender = await rabbitInstance(); // aqui deberia llamar a donde haya declrado la funcion init()
      const response = await sender.rabbitPublishEvent(
        anotherExample.exchanges[0].name,
        anotherExample.id,
        '',
        data,
        { headers }
      );
      return response;
    } catch (e) {
      throw e;
    }
  };
};
```
# Credits
By Paulo Ariel Pareja
