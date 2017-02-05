# Microservice messaging using Hydra

Microservices are distributed applications by nature, so it's not surprising that two key microservice concerns would be inter-process communication and messaging. Those concerns underpin how distributed applications work together over a network and are the focus of this article.

[Hydra](https://github.com/flywheelsports/fwsp-hydra) is a NodeJS library that was open-sourced at the EmpireNode conference in New York City in late 2016. The Hydra project seeks to greatly simplify the building of distributed applications such as microservices. As an NPM package, Hydra has only one external infrastructure dependency - the use of a [Redis](https://redis.io) server. Hydra leverages Redis to coordinate service presence, health, load balancing, discoverability and messaging.

In this article, we'll build a small multiplayer networked game, and in the process learn how Hydra helps facilitate distributed messaging.

## Message transports

Microservices are distributed applications which often need to communicate with one another across a network. Common message transports include HTTP, WebSockets, and raw sockets using messaging servers such as MQTT, RabbitMQ, Redis, and many others. We won't delve into which is better than the others, each is a feasible and proven tool when building non-trivial networked applications.

For now, know that when it comes to messaging there are no shortage of message transport options.

## HTTP Restful APIs vs socket messages

Two of the most common transport methods are HTTP and socket-based messaging. It's useful to briefly consider their underlying differences.

When an application makes an HTTP call, a message is sent to a server and a response or error is reported back. This is known as a request and response communication pattern. HTTP eventually returns a response even if the server it's trying to reach does not respond.

Behind the scenes of an HTTP call, you'll find activities such as DNS resolution followed by a series of TCP/IP handshakes. Thus, what appears to be a simple call involves considerably more work under the hood. All of that can lead to a fair amount of overhead for each message we send. Additionally, the verbosity of HTTP headers can further increase the burden as each call is accompanied by headers on both the sending and receiving side. A running joke is that if you're not careful, the size of your HTTP headers can exceed the size of your message payloads. On a more serious note: HTTP APIs and messaging is great, until they're not.

Now, yes - there are ways to minimize this overhead. But at some point it's important to embrace the right tool for a particular job. An alternative approach is to avoid using HTTP-based messaging and instead use a socket-based approach. With WebSockets, an HTTP call is used to establish the initial connection, but once established there is little additional overhead involved. We also save on the cost of opening and closing TCP socket connections since we keep the WebSocket open as we send and receive messages.

At the lower end of the spectrum is the raw TCP/IP socket - the stuff that powers the HTTP and WebSocket protocols themselves. It might seem advantageous to go straight to the source, but if you go this route then you're faced with the work of buffering and handling message boundaries. Here you wind up building your own protocol. A more common approach is to use a messaging server which handles that work for you while optionally providing messaging delivery assurances.

There is a lot more we could discuss in the section, but key takeaways here are that when it comes to messaging, HTTP introduces overhead which you may not need.

## Hydra Messaging

Hydra supports both HTTP and socket-based messaging. However, in this article we'll only focus on socket-based messaging, as most developers reading this will likely be quite familiar with building HTTP API based servers using ExpressJS and other frameworks.

So how does Hydra assist with messaging? Hydra offers a half dozen message related calls which are designed to simplify the sending and receiving of messages between distributed applications. With Hydra messaging, you don't specify the location of your applications, nor do you need to specify which instance of an application should receive a given message. Hydra's built-in service discovery and routing capabilities transparently address those concerns.

CTT: `Hydra simplifies the sending and receiving of messages between distributed applications. #risingstack #nodejs #microservice #hydra`

Let's have a closer look. A key benefit of Hydra messaging is that we get to use plain old JavaScript objects to construct our messages.

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

Hydra takes care of locating an instance of a microservice called `gameserver` and delivering the message. While the message is a pure JavaScript object, it does have a strict structure. The `to`, `frm` and `bdy` fields are required, and you're encouraged to only add your application specific fields to the `bdy` section.

This message format actually has a name, [UMF](https://github.com/cjus/umf) - universal messaging format. UMF is a simple JavaScript object format that Hydra uses to define routable and queuable messages. But what exactly do we mean by that? A routable message is one that contains enough information for a program to determine who sent the message and where that message needs to go. We provide that information by supplying `to` and `frm` fields. A queuable message is one that can be stored for later processing. Useful message fields include the `mid` field which uniquely identifies a message. Other useful fields not shown here include fields which provide a timestamp, priority, and how long a message should be considered valid. So our messages are considered queuable because they contain enough information to allows us to use, build and manage message queues.

A key reason for using a documented format, such as UMF, is to enable interoperability between services. With a known message format your services don't need to translate between formats. So you won't feel the urge to build a message translation gateway. In my career, I've seen plenty of those.

## The hot potato game

In order to see Hydra messaging in action and have a bit of fun along the way, we're going to implement a variation of [hot potato](https://en.m.wikipedia.org/wiki/Hot_potato_(game)); a children's game. In this game, children assemble in a circle and randomly pass a potato from one player to the next. No one knows who will receive the potato next. A song plays and when it stops - the player holding the potato loses and must step away. The game continues until only one player remains.

CTT: `hpp: A multi-player game using microservices. #risingstack #nodeJS #microservice #hydra`

Our variation will use a timer to denote the end of the game and at that point, the player left holding the potato loses. Simple. Our game will use messages to pass a potato object and won't feature any fancy graphics. Hey, what can I say? I grew up in the days of [Adventure](https://en.m.wikipedia.org/wiki/Colossal_Cave_Adventure).

For the sake of brevity, we're going to look at code fragments, but you can view the [hydra-hpp repo](https://github.com/cjus/hydra-hpp) if you'd like to see the full source.

#### High-level code overview

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

In the `constructor` we'll define our game's configuration settings. The `init` member will contain our initialization of Hydra and the definition of a message listener, where arriving messages are dispatched to our `messageHandler` function. In order to create a bit of realism, we use the `getRandomWait` helper function to randomly delay the passing of the hot potato.

The player with the potato starts the game using the `startGame` function. When a player receives the potato it checks to see if the game timer has expired, if not, then it uses the `passHotPotato` function to send the potato to another player. If the game has expired, then the `gameOver` function is called which in-turn sends out a broadcast message to all players - signaling the end of the game.

#### constructor

At the top of our code, we require a JSON configuration file.

```javascript
const config = require('./config/config.json');
```

The JSON file contains a Hydra branch where we add keys for the name of our service, the service version and more importantly the location of our Redis server.

```javascript
{
  "environment": "development",
  "hydra": {
    "serviceName": "hpp",
    "serviceIP": "",
    "servicePort": 3000,
    "serviceType": "game",
    "serviceDescription": "Serves as a hot potato player",
    "redis": {
      "url": "redis-11914.c8.us-east-1-4.ec2.cloud.redislabs.com",
      "port": 11914,
      "db": 0
    }
  }
}
```

> If you've cloned the repo make and choose to run player instances locally using a single machine then don't forget to change the `hydra.servicePort` to zero in order to instruct Hydra to select a random port.

In my own testing I used a remote Redis instance hosted at RedisLabs as defined in the `redis.url` shown above. Note, the Redis URL above would have expired by the time you read this. I also ran our hot potato game using three AWS EC2 instances. You can, if you prefer, use a local instance of Redis and run the game on your local machine. The reason I chose to use remote infrastructure is to provide a more realistic and practical example. I created a [video to demonstrate this](https://youtu.be/p-UV4d2cUKU).

#### init

The `init` function is where we initialize Hydra. Hydra makes extensive use of ES6 promises, so we use chained `.then()`'s as we register our game player microservice using `hydra.registerService` and then proceed to start the game if this service instance is the player with the potato.

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

The service name and version are shown, but the more interesting bit is the service ID. Each instance of a Hydra service is assigned a unique identifier. We'll see how that becomes useful later in this article.

One interesting code fragment I just glossed over is the `hydra.on()` call, where we define a message listener which simply passes received messages to the game's `messageHandler()` function. The Hydra module derives from [NodeJS event emitter](https://nodejs.org/api/events.html#events_class_eventemitter) and uses that to emit messages and log events. That makes it easy for any app using Hydra to handle incoming messages. 

#### messageHandler

Here is the `messageHandler`, called by the anonymous function we defined in the `hydra.on()` call during the game's `init` function. The message handler first checks whether the message type isn't equal to 'hotpotato'. This check is strictly unnecessary but present only to demonstrate the idea of switching and filtering on message types.

Next, we have a check to compare that `message.bdy.expiration` is less than the current time. It's set to 30 seconds past the start time within the `startGame()` function. The game ends when the expiration time is less than the current time - meaning that 30 seconds has elapsed.  We then create a UMF message using `hydra.createUMFMessage` - a function that adds a unique message ID (mid) and timestamp (ts) to the message object it receives.  

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

We then use the `hydra.sendBroadcastMessage()` function to send the end game message to all available players. Keep in mind that Hydra's built-in service discovery features knows which instances are available and ensures that each receives an end of game message.

While the game is in progress, we announce who has received the hot potato and then call `passHotPotato()` to send it to another player.

#### passHotPotato

In my first implementation of the passHotPotato call I simply took the hotPotatoMessage and waited a random amount of time - between one and two seconds. The goal there was to simulate a player's indecisiveness when deciding who to pass the potato to next.

```javascript
  passHotPotato(hotPotatoMessage) {
    let randomWait = this.getRandomWait(1000, 2000);
    let timerID = setTimeout(() => {
      hydra.sendMessage(hotPotatoMessage);
      clearInterval(timerID);
    }, randomWait);
  }
```

One issue with the above implementation is that the player with the hot potato can send the potato to himself. That's odd - I know! Since the `to` field is defined as `to: 'hpp:/',` any `hpp` service can receive the message - including the sender! To resolve this issue we need to get a list of players and actually avoid choosing the current player. As we saw earlier each running instance of a service receives a unique identifier, so we can use  this identifier to address a message to a specific service  instance. The format for doing this is straightforward: `to: 'aed30fd14c11dfaa0b88a16f03da0940@hpp:/',` - there we simply prepend the ID of the service we're interested in reaching.

But how do we retrieve the ID for distributed services? Hydra has a `getServicePresence()` function which finds all instances of a service, given a service name. The call returns a promise which resolves to an array of service details which include instance IDs.  In the code below we simply loop through the array and grab the details for the first service instance which isn't the current one. Identifying the instance ID for the current running service involves just calling `hydra.getInstanceID`. Too easy, right?

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

To send the potato message we update the `to` and `frm` fields with service IDs. I should point out that updating of the `frm` field is completely optional but a good practice that allows the message receiver to directly communicate back with the sender.

This section covered Hydra messaging in greater detail. For more information see the full [Hydra messaging documentation](https://github.com/flywheelsports/fwsp-hydra/blob/master/documentation.md#using-hydra-to-monitor-services).

#### startGame

The final fragment we'll cover is the code which actually starts the game. Here we create our initial hotPotato message and set the expiration to the current time plus the length of the game.

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

Once the game is installed and configured (by updating the `config/config.json` file with the location of your Redis instance) you're then ready to launch distributed players.

You can add a player named Susan:

```shell
$ node hpp.js Susan
```

In another shell tab or machine, you can add a player named Jane:

```shell
$ node hpp.js Jane
```

This adds a player called John who is also the one initially holding the potato:

```shell
$ node hpp.js John true
```

After a 15 second countdown, the game begins and the potato is passed around.  The game ends after another 30 seconds and the player left holding the potato is declared the loser.

During the development of this article and the sample game, I wanted to test it on cloud infrastructure. So I created [this video](https://youtu.be/p-UV4d2cUKU) as a demonstration. If you'd like to try this yourself, you can also fork the [github repo](https://github.com/cjus/hydra-hpp).

### Listing players using hydra-cli

You can use the Hydra-cli tool to view and interact with hpp instances running locally or across a network.  You can install a copy with:

```shell
$ sudo npm install -g hydra-cli
```

Before you can use hydra-cli you'll need to tell it where your instance of Redis is located. In my own test, I used a free Redis instance running at RedisLabs.

```shell
$ hydra-cli config redislabs
redisUrl: redis-11914.c8.us-east-1-4.ec2.cloud.redislabs.com
redisPort: 11914
redisDb: 0
```

> Don't use the URL above because it would have expired by the time you're reading this. Allocate your own free instance by visiting redislabs.com

Next start a few instances of hpp and type:

```shell
$ hydra-cli nodes
```

Here's the output from my test on AWS:

```shell
$ hydra-cli nodes
[
  {
    "serviceName": "hpp",
    "serviceDescription": "Serves as a hot potato player",
    "version": "1.0.0",
    "instanceID": "fae8260fd74d5bd0f76c2d9e2d1d7c50",
    "updatedOn": "2017-01-26T16:02:17.828Z",
    "processID": 1541,
    "ip": "172.31.29.61",
    "port": 3000,
    "elapsed": 2
  },
  {
    "serviceName": "hpp",
    "serviceDescription": "Serves as a hot potato player",
    "version": "1.0.0",
    "instanceID": "d65b3f302d374606b20dea7189643156",
    "updatedOn": "2017-01-26T16:02:17.516Z",
    "processID": 1600,
    "ip": "172.31.28.89",
    "port": 3000,
    "elapsed": 2
  },
  {
    "serviceName": "hpp",
    "serviceDescription": "Serves as a hot potato player",
    "version": "1.0.0",
    "instanceID": "5b67588a8ef7d5dbd65b551df3926ae4",
    "updatedOn": "2017-01-26T16:02:15.516Z",
    "processID": 1628,
    "ip": "172.31.19.208",
    "port": 3000,
    "elapsed": 4
  }
]
```

As you can see there are three instances shown, each with its own instanceID and unique internal IP address.

After the game completes, the instances will no longer be visible using hydra-cli.  There are a lot of other things you can do with hydra-cli. Just type hydra-cli without options for a complete list.

```shell
$ hydra-cli
hydra-cli version 0.5.2
Usage: hydra-cli command [parameters]
See docs at: https://github.com/flywheelsports/hydra-cli

A command line interface for Hydra services

Commands:
  help                         - this help list
  config instanceName          - configure connection to redis
  config list                  - display current configuration
  use instanceName             - name of redis instance to use
  health [serviceName]         - display service health
  healthlog serviceName        - display service health log
  message create               - create a message object
  message send message.json    - send a message
  nodes [serviceName]          - display service instance nodes
  rest path [payload.json]     - make an HTTP RESTful call to a service
  routes [serviceName]         - display service API routes
  services [serviceName]       - display list of services
```

You might be wondering how the Hydra-cli program works. It's just a Node application which uses the Hydra NPM package to interact with Hydra enabled applications. It's not that different from the hpp application presented in this article. You can review the code on the [Hydra-cli Github repo](https://github.com/flywheelsports/hydra-cli).

## Summary

In this article, we've seen how Hydra and a few methods allowed us to build a distributed multiplayer game using messaging. We saw how sending a message was as simple as using a formatted JavaScript object and the `hydra.sendMessage` function. Using Hydra's underlying service discovery features players were able to find and communicate with one another.

If you'd like to learn more about Hydra, see our [last post here on RisingStack](https://community.risingstack.com/tutorial-building-expressjs-based-microservices-using-hydra) and visit the Hydra [Github repo](https://github.com/flywheelsports/fwsp-hydra).
