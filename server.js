/*
Libraries used:
1. express
2. dotenv
3. ably
*/

const envConfig = require("dotenv").config();
const express = require("express");
const Ably = require("ably");
const gameChannelName = "flapping-bird-game";
let gameChannel;
let birdCount = 0;
let gameTicker;
let isGameTickerOn = false;
let gameStateObj;
let birds = {};
let highScore = 0;
let highScoreNickName = "sad panda";
let birdChannels = {};
let obstacleTimer = 0;
let topScoreChannel;
let topScoreChannelName = "flapping-good-scores";

// Init express and identify file directory
const app = express();
app.use(express.static("dist"));

// Init Ably and direct to API key in env file
const realtime = new Ably.Realtime({
	key: process.env.ABLY_API_KEY,
});

const uniqueId = function () {
	return "id-" + Math.random().toString(36).substr(2, 16);
};

app.get("/", (request, response) => {
	response.sendFile(__dirname + "/index.html");
});

/* Issue token requests to clients sending a request to the /auth endpoint */
app.get("/auth", function (req, res) {
	let tokenParams = {
		clientId: uniqueId(),
	}; /* Use token defaults for now */
	realtime.auth.createTokenRequest(tokenParams, function (err, tokenRequest) {
		if (err) {
			res.status(500).send("Error requesting token: " + JSON.stringify(err));
		} else {
			res.setHeader("Content-Type", "application/json");
			res.send(JSON.stringify(tokenRequest));
		}
	});
});

// Identify the port used by app
const listener = app.listen(process.env.PORT, () => {
	console.log("App is listening on port " + listener.address().port);
});

realtime.connection.once("connected", () => {
	topScoreChannel = realtime.channels.get(topScoreChannelName, {
		params: {
			rewind: 1
		},
	});
	topScoreChannel.subscribe("score", (msg) => {
		highScore = msg.data.score;
		highScoreNickName = msg.data.nickname;
		topScoreChannel.unsubscribe();
	});
	gameChannel = realtime.channels.get(gameChannelName);
	gameChannel.presence.subscribe("enter", (msg) => {
		if (++birdCount === 1 && !isGameTickerOn) {
			gameTicker = setInterval(startGameTick, 100);
			isGameTickerOn = true;
		}
		birds[msg.clientId] = {
			id: msg.clientId,
			left: 220,
			bottom: 350,
			isDead: false,
			nickname: msg.data.nickname,
			score: 0,
		};
		subscribeToPlayerInput(msg.clientId);
	});
	gameChannel.presence.subscribe("leave", (msg) => {
		if (birds[msg.clientId] != undefined) {
			birdCount--;
			birds[msg.clientId].isDead = true;
			setTimeout(() => {
				delete birds[msg.clientId];
			}, 500);
			if (birdCount < 1) {
				isGameTickerOn = false;
				clearInterval(gameTicker);
			}
		}
	});
});

function subscribeToPlayerInput(id) {
	birdChannels[id] = realtime.channels.get("bird-position-" + id);
	birdChannels[id].subscribe("pos", (msg) => {
		if (birds[id]) {
			birds[id].bottom = msg.data.bottom;
			birds[id].nickname = msg.data.nickname;
			birds[id].score = msg.data.score;
			if (msg.data.score > highScore) {
				highScore = msg.data.score;
				highScoreNickName = msg.data.nickname;
				topScoreChannel.publish("score", {
					score: highScore,
					nickname: highScoreNickName,
				});
			}
		}
	});
}

function startGameTick() {
	if (obstacleTimer === 0 || obstacleTimer === 3000) {
		obstacleTimer = 0;
		gameStateObj = {
			birds: birds,
			highScore: highScore,
			highScoreNickName: highScoreNickName,
			launchObstacle: true,
			obstacleHeight: Math.random() * 60,
		};
	} else {
		gameStateObj = {
			birds: birds,
			highScore: highScore,
			highScoreNickName: highScoreNickName,
			launchObstacle: false,
			obstacleHeight: "",
		};
	}
	obstacleTimer += 100;
	gameChannel.publish("game-state", gameStateObj);
}