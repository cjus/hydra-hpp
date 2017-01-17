# Microservice messaging using Hydra
Microservices are distributed applications by nature. As such, two key microservice concerns are inter-process communication and messaging. Those concerns underpin how distributed applications work together over a network.

Hydra is a relatively new NodeJS library that was open-sourced in late 2016 at the EmpireNode conference in New York City. Hydra seeks to greatly simplify the building of distributed applications such as microservices. If you'd like to discover more about Hydra, see our [last post here on RisingStack](https://community.risingstack.com/tutorial-building-expressjs-based-microservices-using-hydra) or visit the Hydra [Github repo](https://github.com/flywheelsports/fwsp-hydra).

In this post we'll build a small multiplayer networked game, and in the process learn how Hydra helps facilitate messaging among microservices.

## Message transports
Distributed applications must rely on a transport mechanism to deliver messages.  That is, messages need to be transported from one process to one or many other processes.

Usual ways of transporting messages include HTTP restful APIs, WebSockets, and raw sockets using messaging servers such as MQTT, RabbitMQ, Redis, and many others.

Each has its strong points and we won't dive into which is better than the others. Each is a feasible and proven tool when solving a variety of actual problems.

For now, know that when it comes to messaging there is no shortage of options. In this post we'll specifically focus on HTTP, Websockets, and socket messaging via Redis.

## Restful APIs vs socket messages
Before we get into the thick of things; it's important to take a closer look at Restful API's and messaging in general.

When an application makes an HTTP call, a message is sent to a server and a response or error is reported back. This is known as a request and response communication model. HTTP returns a response even if the server it's trying to reach does not respond.

HTTP lets us send data payloads using the Post and Put methods so we can send messages that way.

Yet, behind the scenes of an HTTP call is a series of activities such as DNS resolution, a socket connection followed TCP/IP handshakes to ensure a ready state for sending data. Thus, what appears to be a simple call is considerably more work under the hood. And our messages are larger because they're prefixed with HTTP headers.  Now, yes - there are ways to minimize this overhead. You could, for example, batch messages into a single HTTP call at the expense of complicating your application code.

A more efficient transport is a WebSocket connection which doesn't require the opening and closing of socket connections that HTTP requires. Nor does it require for each of our messages to have an HTTP header.

Then, there are pure TCP/IP socket connections) - the stuff that underlies WebSockets themselves. If you go this route then you're faced with the work of buffering and handling message boundaries. Here you wind up building your own protocol. A more common approach is to use a messaging server which handles that work for you and providing messaging delivery assurances. Hydra uses Redis messages which not only uses sockets but also encodes your messages in a binary format.

There is a lot more we could discuss in the section, but it's time to look at the actual code and explore Hydra's take on messaging.

## Messages
Let's imagine that a message is strictly a JSON object - naturally, it doesn't have to be. As we discussed earlier, we can package such a message for use in an HTTP Post or Put call. We can also send the message as is, via a WebSocket or raw socket. And lastly, we can send the message to a message broker service.

This is exactly what we'll focus on in this article. So, how does Hydra come into this picture? Hydra makes it trivial to send messages between applications.

> examples of messaging in hydra...

## UMF, Universal messaging format
Hydra uses a  message format called UMF. A key benefit for using a documented format is to enable interoperability between services. With a known message format your services don't need to translate between formats and you won't feel the urge to build a message translation gateway.  In my career, I've seen plenty of those.

UMF messages are designed to be both routable and queuable. But what exactly do we mean by that?

A routable message is one that contains enough information for a program to determine who sent the message and where that message needs to go.

> Examples

A queuable message is one that can be stored for later processing. Important message fields include values for when the message was sent and how long that message should be considered valid. Other useful fields include a priority to help determine which messages to process at any given time.

## The hot potato game
We're going to implement a variation of [hot potato](https://en.m.wikipedia.org/wiki/Hot_potato_(game)); a children's game. In this game, children assemble in a circle and pass a potato from one player to the next. No player knows who will receive the potato next. A song plays and when it stops - the player holding the potato loses and must step away. The game continues until only one player is left.

Our variation will use a timer to denote the end of the game and the player left holding the potato loses. Our game will use messages to pass a potato object and won't feature any fancy graphics. Hey, what can I say? I grew up in the days of [Adventure](https://en.m.wikipedia.org/wiki/Colossal_Cave_Adventure).

Let's build the project. In the steps below name your start file `hpp.js`.

```
$ npm init
$ npm install fwsp-hydra --save
```

Three players, Tom, Susan and Jill.

The user starts up three hpp (hot potato player) apps. Each one is started with a player name and only one is started with a potato flag set to true.

```
$ hpp Tom
$ hpp Susan
$ hpp Jill true
```

The player with the potato waits 15 seconds before searching for other players. It picks a player and sends the potato.

The potato message has a 15-second expiration timeout.
During the game each player announcing who she's passed the potato to.

If a player receives a potato message that has timed out then he declares himself the loser and sends an end game message.

All players who receive an end game message call process.exit(0)

We're going to use a remote Redis instance hosted at RedisLabs.  We're also going to run our hot potato game using three AWS EC2 instances. You can, if you prefer, use a local instance of Redis and run the game on your local machine. The point of our use of remote infrastructure is to provide a more realistic and practical example.

### Code overview

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

In the `constructor` we'll define our games configuration settings. The `init` member will contain our initialization of hydra and the definition a message listener where arriving messages are dispatched to our `messageHandler` member. In order to create a bit of realism, we use the `getRandomWait` helper function to randomly delay the passing of the hot potato.

The player with the potato starts the game using the `startGame` member. When a player receives the potato it checks to see if the game timer has expired, if not, then it uses the `passHotPotato` member to send the potato to another player. If the game has expired then the `gameOver` member is called which in-turn sends out a broadcast message to all players signaling the end of the game.
