import _ from 'lodash';
import Promise from 'bluebird';

import config from '../../tracker.json';

import {log} from '../util/util';
import database from '../util/database';
import Player from './player';
import {saveSpy} from './spy';

class PlayerManager {
	constructor() {
		this.players = {};
		this.bans = {};
		this.banNames = {};
	}

	updatePlayer(gameMode, newState, oldState) {
		let name = newState.name;
		if (this.banNames[name] || this.bans[newState.ip]) return;
		if (!this.players[name]) this.players[name] = new Player(name);
		this.players[name].updateState(gameMode, newState, oldState);
	}

	flushplayers() {
		let self = this;
		return database('players').whereIn('name', _.map(self.players, 'name')).then(rows => {
			rows = _.keyBy(rows, 'name');
			let numPlayers = self.players.length;
			return database.transaction(function(trx) {
				return Promise.all(self.players.map(player => player.saveStats(rows[player.name], trx))).finally(trx.commit);
			}).then(() => {
				self.players = {};
				return numPlayers;
			});
		}).then(numPlayers => {
			log(`Players flushed, ${numPlayers} players updated`);
		}).then(saveSpy);
	}

	isOnline(name) {
		// FIXME can have short window of error after flushing
		return !!this.players[name];
	}

	start() {
		let self = this;
		database.select().table('bans').then(bans => {
			_.each(bans, function (ban) {
				if (ban.ip) self.bans[ban.ip] = true;
				if (ban.name) self.banNames[ban.name] = true;
			});
		});

		setInterval(() => {
			this.flushplayers();
		}, config.tracker.savePlayersInterval*1000);
	}
}

var playerManager = new PlayerManager();
export default playerManager;
