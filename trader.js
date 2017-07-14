/**
 * OFFLOADER
 *
 * Once logged in, sends a trade offer containing this account's entire tradable CS:GO inventory.
 */

var SteamUser = require('steam-user');
var SteamCommunity = require('steamcommunity');
var SteamTotp = require('steam-totp');
var config = require('./config.js');
var TradeOfferManager = require('steam-tradeoffer-manager'); // use require('steam-tradeoffer-manager') in production
var fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());


var client = new SteamUser();
var manager = new TradeOfferManager({
	"steam": client, // Polling every 30 seconds is fine since we get notifications from Steam
	"domain": "example.com", // Our domain is example.com
	"language": "en" // We want English item descriptions
});
var community = new SteamCommunity();

// Steam logon options
var logOnOptions = {
	accountName: config.username,
	password: config.password,
	twoFactorCode: SteamTotp.getAuthCode(config.sharedSecret)
};

if (fs.existsSync('polldata.json')) {
	manager.pollData = JSON.parse(fs.readFileSync('polldata.json'));
}

client.logOn(logOnOptions);

client.on('loggedOn', function () {
	console.log("Logged into Steam!");
});

client.on('webSession', function (sessionID, cookies) {
	client.setPersona(SteamUser.EPersonaState.Online);
	app.options("/*", function (req, res, next) {
		res.header('Access-Control-Allow-Origin', '*');
		res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
		res.sendStatus(200);
	});

	console.info("Got web session configuring cookies and setting web service");
	manager.setCookies(cookies, function (err) {
		console.info("Setting cookies");
		if (err) {
			console.log(err);
			process.exit(1); // Fatal error since we couldn't get our API key
			return;
		}
		console.log("Got API key: " + manager.apiKey);

		app.post('/inventory', function (req, res) {
			console.log(req.body);
			res.setHeader('Access-Control-Allow-Origin', '*');
			fs.readFile('data2.json', function (err, data) {
				res.send(data);
			});
			/*
			manager.getUserInventoryContents(req.body.user_id, 570, 2, true,
				function (err, inventory, cur) {
					if (err) {
						res.sendStatus(500);
					}else {
						fs.writeFile('data2.json', JSON.stringify(inventory), function (err) { 
							console.log(err);
						});
						res.send(inventory);
					}
					
				});*/
		});
		app.post('/trade', function (req, res) {
			console.log(req.body);
			res.setHeader('Access-Control-Allow-Origin', '*');
			items = req.body.items.map((res) => {
				return {
					'assetid': res.split('_')[0],
					'appid': 570,
					'contextid': 2,
					'amount': 1
				}
			}).reduce((a, b) => {
				if (a[b.assetid]) {
					a[b.assetid].amount++
				} else {
					a[b.assetid] = b;
				}
				return a;
			}, {});
			items = Object.keys(items).map((key) => items[key]);
			var offer = manager.createOffer(req.body.trade_url);
			offer.addTheirItems(items);
			offer.setMessage("Your trade offer is ready");
			offer.send(function (err, status) {
				if (err) {
					console.log(err);
					return;
				}

				if (status == 'pending') {
					// We need to confirm it
					console.log(`Offer #${offer.id} sent, but requires confirmation`);
					community.acceptConfirmationForObject(config.identitySecret, offer.id, function (err) {
						if (err) {
							console.log(err);
						} else {
							console.log("Offer confirmed");
						}
					});
				} else {
					console.log(`Offer #${offer.id} sent successfully`);
				}
			});
		});
		// Get our inventory
		// manager.getInventoryContents(570, 2, true, function(err, inventory) {
		// 	if (err) {
		// 		console.log(err);
		// 		return;
		// 	}

		// 	if (inventory.length == 0) {
		// 		// Inventory empty
		// 		console.log("CS:GO inventory is empty");
		// 		return;
		// 	}

		// 	console.log("Found " + inventory.length + " CS:GO items");

		// 	// Create and send the offer

		// 	var offer = manager.createOffer("https://steamcommunity.com/tradeoffer/new/?partner=106403191&token=Ue0DnQHD");
		// 	offer.addMyItems(inventory);
		// 	offer.setMessage("Here, have some items!");
		// 	offer.send(function(err, status) {
		// 		if (err) {
		// 			console.log(err);
		// 			return;
		// 		}

		// 		if (status == 'pending') {
		// 			// We need to confirm it
		// 			console.log(`Offer #${offer.id} sent, but requires confirmation`);
		// 			community.acceptConfirmationForObject(config.identitySecret, offer.id, function(err) {
		// 				if (err) {
		// 					console.log(err);
		// 				} else {
		// 					console.log("Offer confirmed");
		// 				}
		// 			});
		// 		} else {
		// 			console.log(`Offer #${offer.id} sent successfully`);
		// 		}
		// 	});
		// });
	});

	community.setCookies(cookies);

	app.listen(8088);
	console.info('Listening on 8088 Server started...')
});

// manager.on('sentOfferChanged', function(offer, oldState) {
// 	console.log(`Offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`);
// });

manager.on('pollData', function (pollData) {
	fs.writeFile('polldata.json', JSON.stringify(pollData), function () { });
});

/*
 * Example output:
 *
 * Logged into Steam
 * Got API key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * Found 117 CS:GO items
 * Offer #1601569319 sent, but requires confirmation
 * Offer confirmed
 */
