# Microservice messaging using Hydra

Microservices are distributed applications by nature. As such, two key microservice concerns are inter-process communication and messaging. Those concerns underpin how distributed applications work together over a network.

Hydra is a NodeJS library that was open-sourced in late 2016 at the EmpireNode conference in New York City. Hydra seeks to greatly simplify the building of distributed applications such as microservices.  In this post we'll build a small multiplayer networked game, and in the process learn how Hydra helps facilitate messaging.

After reviewing this article you can watch a video demo and try the code by forking the sample repo or pulling the docker image.

## Message transports

Distributed applications must rely on a mechanism to deliver messages.  That is, messages need to be transported from one process to one or many other processes.

Usual ways of transporting messages include HTTP restful APIs, WebSockets, and raw sockets using messaging servers such as MQTT, RabbitMQ, Redis, and many others.

Each has its strong points and we won't delve into which is better than the others. Each is a feasible and proven tool when solving a variety of actual problems.

For now, know that when it comes to messaging there is no shortage of options.

## Restful APIs vs socket messages

Before we get into the thick of things; it's important to take a closer look at a few underlying differences between Restful API's and socket messaging.

When an application makes an HTTP call, a message is sent to a server and a response or error is reported back. This is known as a request and response communication model. HTTP returns a response even if the server it's trying to reach does not respond. With sockets we get to choose whether or not to receive confirmation messages.

HTTP lets us send data payloads using the Post and Put methods so we can send messages inside of HTTP requests. That's just a heavier set way of sending messages.

Behind the scenes of an HTTP call you'll find a series of activities such as DNS resolution, a socket connection followed TCP/IP handshakes to ensure a ready state for sending data. Thus, what appears to be a simple call is considerably more work under the hood. And our messages are larger because they're prefixed with HTTP headers.  Now, yes - there are ways to minimize this overhead. You could, for example, batch messages into a single HTTP call at the expense of complicating your application code.

A more efficient transport for messaging is a WebSocket connection which doesn't require the opening and closing of socket connections that HTTP requires. Nor does it require that each of our messages include an HTTP header with verbose text fields.

Then, there are pure TCP/IP socket connections - the stuff that underlies WebSockets themselves. If you go this route then you're faced with the work of buffering and handling message boundaries. Here you wind up building your own protocol. A more common approach is to use a messaging server which handles that work for you and providing messaging delivery assurances.

There is a lot more we could discuss in the section, but a key takeaway is that when it comes to messaging, HTTP introduces overhead which you may not need.

Many NodeJS developers have grown up using HTTP RESTful interfaces and have never really ventured past that. If that's you, there's no shame in that - it's where many of us started! However, here's your chance to explore non-HTTP messaging. If you're an old pro who's used socket-based messaging, then you may be surprised at how much easier the approach we'll discuss here is for connecting microservices.

## Messages

So how does Hydra assist with messaging? For starters, Hydra makes it trivial to send and receive messages between distributed applications. With Hydra messaging, you don't have to specify the location of your applications, nor do you need to specify which instance of an application should receive the message. Those concerns are addressed by Hydra using its built-in service discover and routing capabilities.

Let's agree that what we mean by `message` is strictly a JavaScript object.

```javascript
let message = {
  to: 'gameserver:/',
  frm: 'player:/',
  mid: '123',
  bdy: {
    command: 'start'
  }
};
```

We could send that message using Hydra's `sendMessage` function.

```javascript
hydra.sendMessage(message);
```

Hydra takes care of locating an instance of a microservice called `gameserver` and sending it the message.  While the message shown above is a pure JavaScript object it does seem to have fields for routing and identifying messages. This message format actually has a name, [UMF](https://github.com/cjus/umf) - a universal messaging format. UMF is a simple JavaScript object format that Hydra uses to define routable messages.  

UMF messages are designed to be both routable and queuable. But what exactly do we mean by that?

A routable message is one that contains enough information for a program to determine who sent the message and where that message needs to go. We provide that information by supplying `to` and `frm` fields.

A queuable message is one that can be stored for later processing. Useful message fields include the `mid` field which uniquely identifies a message. Other useful fields, not shown here, include fields which provide timestamps, priority and how long a message should be considered valid. Our messages are queuable because they contain enough information to allows us to build and manage message queues.

The `to` field contains the name of a destination service.  The `frm` field simply says that this message originated from the player service. The `mid` or message ID field provides an identifier for the message and the `bdy` or body field contains a command to start a new game.

A key benefit for using a documented format, such as UMF, is to enable interoperability between services. With a known message format your services don't need to translate between formats and you won't feel the urge to build a message translation gateway. In my career, I've seen plenty of those.

## The hot potato game

In order to see Hydra messaging in action and have a bit of fun along the way, we're going to implement a variation of [hot potato](https://en.m.wikipedia.org/wiki/Hot_potato_(game)); a children's game. In this game, children assemble in a circle and randomly pass a potato from one player to the next. No one knows who will receive the potato next. A song plays and when it stops - the player holding the potato loses and must step away. The game continues until only one player remains.

Our variation will use a timer to denote the end of the game and at that point the player left holding the potato loses. Simple. Our game will use messages to pass a potato object and won't feature any fancy graphics. Hey, what can I say? I grew up in the days of [Adventure](https://en.m.wikipedia.org/wiki/Colossal_Cave_Adventure).

For the sake of brevity, we're going to look at code fragments, but you can fork the [hydra-hpp repo](https://github.com/cjus/hydra-hpp) if you'd like to follow along.

#### High level code overview

We begin with a class and just over half a dozen member functions.

```javascript
class HotPotatoPlayer {
  constructor() {}
  init() {}
  messageHandler(message) {}
  getRandomWait(min, max) {}
  startGame() {}
  gameOver(result) {}
  passHotPotato(hotPotatoMessage) {}  
}
```

In the `constructor` we'll define our game's configuration settings. The `init` member will contain our initialization of hydra and the definition a message listener where arriving messages are dispatched to our `messageHandler` member. In order to create a bit of realism, we use the `getRandomWait` helper function to randomly delay the passing of the hot potato.

The player with the potato starts the game using the `startGame` function. When a player receives the potato it checks to see if the game timer has expired, if not, then it uses the `passHotPotato` function to send the potato to another player. If the game has expired then the `gameOver` member is called which in-turn sends out a broadcast message to all players signaling the end of the game.

#### constructor

We define a configuration object which contains a hydra branch where we add keys for the name of our service, the service version and more importantly the location of our Redis instance. In a more involved application the configuration should be placed in a file and loaded at runtime.

```javascript
constructor() {
  this.config = {
    "environment": "development",
    "hydra": {
      "serviceName": "hpp",
      "serviceVersion": version,
      "serviceIP": "",
      "servicePort": 0,
      "serviceType": "game",
      "serviceDescription": "Serves as a hot potato player",
      "redis": {
        "url": "redis1.p45rev.0001.usw1.cache.amazonaws.com",
        "port": 6379,
        "db": 1
      }
    }
  };
}
```

We're going to use a remote Redis instance hosted at RedisLabs as defined in the `redis.url` shown above. We're also going to run our hot potato game using three AWS EC2 instances. You can, if you prefer, use a local instance of Redis and run the game on your local machine. The point of our use of remote infrastructure is to provide a more realistic and practical example. Now obviously you can't tell whether I'm actually using a using cloud infrastructure so I created a video to demonstrate this.

#### init

The ``init`` function is where we initialize Hydra. Hydra makes extensive use of ES6 promises. We use chained then's to register our game player microservice using `hydra.registerService` and then start the game if this service instance is the player with the potato.  

```javascript
init() {
  :
  :
  hydra.init(this.config.hydra)
    .then(() => hydra.registerService())
    .then(serviceInfo => {
      console.log(`Starting ${this.config.hydra.serviceName} (v.${this.config.hydra.serviceVersion})`);
      console.log(`Service ID: ${hydra.getInstanceID()}`);
      hydra.on('message', (message) => {
        this.messageHandler(message);
      });
      if (this.isStarter) {
        this.startGame();
      }
    })
    .catch(err => console.log('Error initializing hydra', err));
}
```

The output from starting an instance of hpp looks like this:

```shell
$ node hpp Fred
Starting hpp (v.1.0.0)
Service ID: aed30fd14c11dfaa0b88a16f03da0940
```

The service name (hpp) and version are shown, but the more interesting bit is the service ID. Each instance of a Hydra service is assigned a unique identifier. We'll see how that becomes useful later in this article.

One interesting code fragment I just glossed over is the `hydra.on()` call, where we define a message listener which simply passes received messages to the game's `messageHandler()` function. The Hydra module derives from [NodeJS emitter](https://nodejs.org/api/events.html#events_class_eventemitter) and uses that to emit messages and log events.

#### messageHandler

Here is the `messageHandler`, called by the function we defined in the `hydra.on()` handler during the game's `init` function. The message handler first checks whether the message type is not equal to 'hotpotato'. This check is strictly unnecessary but present only to demonstrate the idea of switching and filtering on message type.

Next we have a check to compare that `message.bdy.expiration` is less than the current time. The message expiration is set to 30 seconds past the current time in the `startGame()` function. The game is ended when the expiration time is less than the current time.  We then create a UMF message using `hydra.createUMFMessage` and use the `hydra.sendBroadcastMessage()` function to send it to all available players.


```javascript
  messageHandler(message) {
    if (message.typ !== 'hotpotato') {
      return;
    }
    if (message.bdy.expiration < Math.floor(Date.now() / 1000)) {
      let gameOverMessage = hydra.createUMFMessage({
        to: 'hpp:/',
        frm: 'hpp:/',
        typ: 'hotpotato',
        bdy: {
          command: 'gameover',
          result: `Game over, ${this.playerName} lost!`
        }
      });
      hydra.sendBroadcastMessage(gameOverMessage);
    } else if (message.bdy.command === 'gameover') {
      this.gameOver(message.bdy.result);
    } else {
      console.log(`[${this.playerName}]: received hot potato.`);
      this.passHotPotato(message);
    }
  }
```

While the game is in progress, we report who has received the hot potato and call `passHotPotato()` to send it to another player.

#### passHotPotato

In my first implementation of the passHotPotato call I simply took the hotPotatoMessage and waited a random amount of time between one and two seconds. The goal there was to simulate a players indecisiveness then deciding who to pass the potato to next.

```javascript
  passHotPotato(hotPotatoMessage) {
    let randomWait = this.getRandomWait(1000, 2000);
    let timerID = setTimeout(() => {
      hydra.sendMessage(hotPotatoMessage);
      clearInterval(timerID);
    }, randomWait);
  }
```

One issue with the above implementation is that the player with the hot potato can send the potato to himself. The reason is because Hydra sendMessage uses the `to` field in the message to determine which service should receive the message. Because the message has a `to` defined this way `to: 'hpp:/',` then any `hpp` service can receive the message. To resolve this problem we actually need to get a list of players and actually choose which one to send the potato message to.  Earlier we saw how the output of running hpp reveals the service ID. Each running instance of a service receives a unique identifier.  We can take advantage of this fact in order to address a message to a specific instance.  The format for doing is straightforward: `to: 'aed30fd14c11dfaa0b88a16f03da0940@hpp:/',` - where will simply prepend the ID of the service we're interested in reaching.

But how do we retrieve the ID for all distributed services? Hydra has a `getServicePresence()` function which finds all instances of a service given a service name. The call returns a promise which resolves to an array of service details. In those details are the instance IDs.  In the code below we simply loop through the array and grab the details for the first service instance which isn't the current one.  Identifying the instance ID for the current running service involves just calling `hyda.getInstanceID`. Too easy, right?

```javascript
  passHotPotato(hotPotatoMessage) {
    let randomWait = this.getRandomWait(1000, 2000);
    let timerID = setTimeout(() => {
      hydra.getServicePresence('hpp')
        .then((instances) => {
          for (let i=0; i <= instances.length; i++) {
            if (instances[i].instanceID !== hydra.getInstanceID()) {
              hotPotatoMessage.to = `${instances[i].instanceID}@hpp:/`;
              hotPotatoMessage.frm = `${hydra.getInstanceID()}@hpp:/`;
              hydra.sendMessage(hotPotatoMessage);
              clearInterval(timerID);
              break;
            }
          }
        });
    }, randomWait);
  }
```

To send the potato message we update the `to` and `frm` fields with service IDs.  I should point out that the updating of the `frm` field is completely optional but a good practice that allows the message receiver to directly communicate back with the sender.

This section covered Hydra messaging in greater detail. For more information on that topic see the full [Hydra messaging documentation](https://github.com/flywheelsports/fwsp-hydra/blob/master/documentation.md#using-hydra-to-monitor-services).

#### startGame

The final code we'll review is the code which actually kicks of the start of the game. Here we create our initial hotPotato message and set the

```javascript
:
  let hotPotatoMessage = hydra.createUMFMessage({
    to: 'hpp:/',
    frm: 'hpp:/',
    typ: 'hotpotato',
    bdy: {
      command: 'hotpotato',
      expiration: Math.floor(Date.now() / 1000) + gameLength
    }
  });
  this.passHotPotato(hotPotatoMessage);
:
```


## Seeing the game in action

During the development of this article and the sample game I wanted to test it on cloud infrastructure. So I created [this video]() to demonstrate that working.
If you'd like to try this yourself, you can also pull the hpp game in a docker container or just fork the github repo.

You can add a player named Susan by:

```shell
$ node hpp.js Susan
```

On another shell tab or machine, you can add another player named Jane.

```shell
$ node hpp.js Jane
```

This adds a player called John who is also the one initially holding the potato.

```shell
$ node hpp.js John true
```

After a 15 second countdown the game begins and the potato is passed around.  The game ends after another 30 seconds and the player left holding the potato is declared the loser.

### Listing players using hydra-cli

As an extra tool, you can use the Hydra-cli (command line) tool to view an interact with hpp instances running locally or across a network.  You can install a copy of the hydra-cli with:

```shell
$ sudo npm install -g hydra-cli
```

Before you can use hydra-cli you'll need to tell it where your instance of Redis is located. In my own test I used a free Redis instance running at RedisLabs.

```shell
$ hydra-cli config redislabs
redisUrl: redis-11914.c8.us-east-1-4.ec2.cloud.redislabs.com
redisPort: 11914
redisDb: 0
```

Next start a few instances of hpp and type:

```shell
$ hydra-cli nodes
```

You should see information around your running instances.  After the game completes the instances will no longer be visible using hydra-cli.  There are a lot of other things you can do with hydra-cli. Just type hydra-cli without options for a complete list.

```shell
$ hydra-cli
hydra-cli version 0.5.1
Usage: hydra-cli command [parameters]
See docs at: https://github.com/flywheelsports/hydra-cli

A command line interface for Hydra services

Commands:
  help                         - this help list
  config instanceName          - configure connection to redis
  config list                  - display current configuration
  use instanceName             - name of redis insance to use
  health [serviceName]         - display service health
  healthlog serviceName        - display service health log
  message create               - create a message object
  message send message.json    - send a message
  nodes [serviceName]          - display service instance nodes
  rest path [payload.json]     - make an HTTP RESTful call to a service
  routes [serviceName]         - display service API routes
  services [serviceName]       - display list of services
```

How does the Hydra-cli work? It's just a Node application which uses the Hydra NPM package to interact with Hydra enabled applications. You can review the code on the [Hydra-cli Github repo](https://github.com/flywheelsports/hydra-cli).

## Summary

In this article we've seen how Hydra and a few methods allowed us to build a distributed multiplayer game using messaging. We saw how sending a message was as simple as using a formatted JavaScript object and the `hydra.sendMessage` function. Using Hydra's underlying service discovery features players where able to find and communicate with one another.

If you'd like to learn more about Hydra, see our [last post here on RisingStack](https://community.risingstack.com/tutorial-building-expressjs-based-microservices-using-hydra) or visit the Hydra [Github repo](https://github.com/flywheelsports/fwsp-hydra).
