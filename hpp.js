const hydra = require('fwsp-hydra');
const version = require('./package.json').version;
const config = require('./config/config.json');

class HotPotatoPlayer {
  /**
	* @name constructor
	* @summary Setup config
	*/
  constructor() {
    this.config = config;
    this.config.hydra.serviceVersion = version;
  }

  /**
	* @name init
	* @summary Initialize player service
	* @return {undefined}
	*/
  init() {
    if (process.argv.length < 3) {
      console.log('Hot Potato Player requires a username');
      console.log('Syntax: hpp username [true]');
      console.log('  true - The player set to true will start the game.');
      process.exit();
    }

    this.playerName = process.argv[2];
    this.isStarter = (process.argv[3]) ? true : false;

    hydra.init(this.config.hydra)
      .then(() => hydra.registerService())
      .then(_serviceInfo => {
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

  /**
	* @name messageHandler
	* @summary handle incoming messages
	* @param {object} message - message object
	* @return {undefined}
	*/
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

  /**
	* @name getRandomWait
	* @summary Return a number from min (inclusive) to max (inclusive)
	* @param {number} min - minimum wait value
	* @param {number} max - maximum wait value
	* @return {number} result - random delay
	*/
  getRandomWait(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
	* @name startGame
	* @summary Begin a Hot Potato Game
	* @return {undefined}
	*/
  startGame() {
    const gameDelay = 15000; //15 seconds in milliseconds
    const gameLength = 30; // seconds
    let elapsedSeconds = 0;
    let timerID = setInterval(() => {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`Game starting in: ${ (gameDelay / 1000) - elapsedSeconds} seconds`);

      if (elapsedSeconds === (gameDelay / 1000)) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write('Sending hot potato...\n');

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
        clearInterval(timerID);
      }
      elapsedSeconds += 1;
    }, 1000);
  }

  /**
	* @name gameOver
	* @summary Handle game over
	* @param {string} result - result of game
	* @return {undefined}
	*/
  gameOver(result) {
    console.log(result);
    hydra.shutdown();
    process.exit(0);
  }

  /**
	* @name passHotPotato
	* @summary Pass hot potato to another player
	* @param {object} hotPotatoMessage - hot potato message
	*/
  // passHotPotato(hotPotatoMessage) {
  // 	let randomWait = this.getRandomWait(1000, 2000);
  // 	let timerID = setTimeout(() => {
  // 		hydra.sendMessage(hotPotatoMessage);
  // 		clearInterval(timerID);
  // 	}, randomWait);
  // }

  /**
	* @name passHotPotato
	* @summary Improved version of Passing hot potato to another player
	* @param {object} hotPotatoMessage - hot potato message
	* @return {undefined}
	*/
  passHotPotato(hotPotatoMessage) {
    let randomWait = this.getRandomWait(1000, 2000);
    let timerID = setTimeout(() => {
      hydra.getServicePresence('hpp').then((instances) => {
        let sent = false;
        for (let i = 0; i < instances.length; i++) {
          if (instances[i].instanceID !== hydra.getInstanceID()) {
            hotPotatoMessage.to = `${instances[i].instanceID}@hpp:/`;
            hotPotatoMessage.frm = `${hydra.getInstanceID()}@hpp:/`;
            hydra.sendMessage(hotPotatoMessage);
            clearInterval(timerID);
            sent = true;
            break;
          }
        }
        if (!sent) {
          console.log('No other players found. Try adding players first and then starting the player with the hot potato last.');
          clearInterval(timerID);
          hydra.shutdown();
          process.exit(0);
        }
      });
    }, randomWait);
  }
}

(new HotPotatoPlayer()).init();
