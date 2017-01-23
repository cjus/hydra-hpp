# hydra-hpp
Hydra Hot Potato Player (game)

A variation on the children's classic game, [Hot Potato](https://en.wikipedia.org/wiki/Hot_potato_(game)). Adopted as a distributed computing example of network messaging using [Hydra](https://github.com/flywheelsports/fwsp-hydra).

## Install

Installation is simple, just npm install to pull the package dependencies.

```shell
$ npm install
```

## Requirements

This sample project has only one external dependency, a running instance of [Redis](https://redis.io/). If you're new to Redis checkout this [Redis quick start guide](https://youtu.be/eX7EamF_WuA) on YouTube.

You're free to run multiple instances of the Hot Potato Player on a single machine. However, it's a lot more fun to run multiple instances across a network of machines. If you try that, make sure your HPP instances and Redis are also network accessible.

## Starting a game

Before you start a game, check the config object in the constructor of the hpp.js file. Make sure to update the `Redis` section with the location of your Redis instance.

```javascript
"redis": {
  "url": "127.0.0.1",
  "port": 6379,
  "db": 1
}
```

You can add a player to the game by:

```shell
$ node hpp.js John true
```

This adds a player called John who is also the one initially holding the potato.

You can add other players, but make sure to provide unique names to keep results clear.

```shell
$ node hpp.js Susan
```

On another shell tab or machine:

```shell
$ node hpp.js Jane
```

After a 15 second countdown the game begins and the potato is passed around.  The game ends after another 30 seconds and the player left holding the potato is declared the loser.
