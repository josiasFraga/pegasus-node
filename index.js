const fs = require('fs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

errorFile = './errors.txt';

const http = require('http').createServer(app);
const io = require('socket.io').listen(http);
const cors = require('cors')
const axios = require('axios');

const pagseguro = require('./pagseguro');

var baseUrlApi = 'http://localhost:8000/restfull';
var baseUrlTelegram = 'http://localhost:8000/telegram/hook.php';

app.use(cors());
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded()); // to support URL-encoded bodies

app.use(function(req, res, next) {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		res.setHeader('Access-Control-Allow-Credentials', true);
		next();
});

var clients = [];
var users = [];

app.get('/', function(req, res) {
		res.send('<h1>Hello World!</h1>');
});
app.post('/pagseguro/:slug', async (req,res) => {
	res.send('ok received');
	console.log("RECEBIDO PAGSEGURO");
	console.log(req.body);
	const notification = await pagseguro.processNotification(req.body, req.params.slug, baseUrlApi);
	if (!notification) {
		console.log("An error ocurred on processing notification..");
	}

});
http.listen(21039, function() {
		console.log('\n\nlistening on *:21039');
});
io.sockets.on('connection', function(socket) {
	socket.on('newCliente', async (data) => {
		try {
			const response = await axios.get(baseUrlApi + '/restaurantes/nodeSetaClienteOnline/' + data.id);
			if (response.data.status != 'ok') {
					var msgError = new Date() + ' - ERROR on setting client online. {socket: '+socket.id+', client_id: '+data.id+'}\n';
					fs.writeFile(errorFile, msgError, function(err) {       });

					console.error(msgError);
					return false;
			}

			clients.push({
					'socket_id': socket.id,
					'client_id': data.id
			});

			socket.join('channel_clientes');

			io.sockets.emit("client-change-status", {
					'socket_id': socket.id,
					'client_id': data.id,
					'status': 'connect'
			});

			console.log("Client connected {socket: "+socket.id+", client_id: "+data.id+"}, count clients connected now: "+Object.keys(clients).length+"\n\n");
		} catch (error) {
			fs.writeFile(errorFile, error, function(err) {  });

			console.error(error);
		}
	});
	socket.on('newUser', function(data) {
		users.push({
				'socket_id': socket.id
		});
		socket.join('channel_usuarios');

		console.log("User connected {socket: "+socket.id+"}, count users connected now: "+Object.keys(users).length+"\n\n");

		io.to(socket.id).emit('restaurantsOn', clients);
	});

	socket.on('newOrder', async (data) => {
		var pedido_id = Number(data.order_id);
		console.log('New order arrived: ' + pedido_id);
		if (pedido_id == 0 || pedido_id == NaN || pedido_id == 'NaN' || isNaN(pedido_id)) {
			let msgError = new Date() + ' - New order - Order ' + pedido_id + ' is not a number!';
			fs.writeFile(errorFile, msgError, function(err) {       });
			console.error(msgError);
			return false;
		}

		try {
			const response = await axios.get(baseUrlApi + '/restaurantes/nodeBuscaEmpresaPedido/' + pedido_id);
			if (response.data.status != 'ok') {
				let msgError = new Date() + ' - couldnt find this order, maybe status is waiting payment..\n';
				fs.writeFile(errorFile, msgError, function(err) {       });
				console.error(msgError);
				return false;
			}

			const empresa_id = response.data.pedido_empresa;
			const empresa_id_sessoes = clients.filter(client => client.client_id == empresa_id);

			empresa_id_sessoes.map(item => {
					io.to(item.socket_id).emit('newOrder', {
							pedido_id: pedido_id
					});
					console.log("Order " + pedido_id + " sent to client!");
			});

			(async() => {
				console.log("Sending to Telegram URL:" + baseUrlTelegram + '?pid=' + pedido_id)
				await axios.get(baseUrlTelegram + '?pid=' + pedido_id);
			})();
		} catch (error) {
			fs.writeFile(errorFile, error, function(err) {  });
			console.error(error);
		}
	});

	socket.on('evaluated', async (data) => {
		var pedido_id = Number(data.order_id);
		console.log('New evaluation arrived: ' + pedido_id);
		if (pedido_id == 0 || pedido_id == NaN || pedido_id == 'NaN' || isNaN(pedido_id)) {
				let msgError = new Date() + ' - (error on evaluated order) - Order ' + pedido_id + ' is not a number!';
				fs.writeFile(errorFile, msgError, function(err) {       });
				console.error(msgError);
				return false;
		}

		try {
				const response = await axios.get(baseUrlApi + '/restaurantes/nodeBuscaEmpresaPedidoAvaliacao/' + pedido_id);
				if (response.data.status != 'ok') {
						let msgError = new Date() + ' - (error on evaluated order) error on getting order client id\n';
						fs.writeFile(errorFile, msgError, function(err) {       });
						console.error(msgError);
						return false;
				}

				const empresa_id = response.data.pedido_empresa;
				const empresa_id_sessoes = clients.filter(client => client.client_id == empresa_id);

				empresa_id_sessoes.map(item => {
						io.to(item.socket_id).emit('evaluated', {
								pedido_id: pedido_id
						});
						console.log("Evaluation " + pedido_id + " sent to client!");

				});
		} catch (error) {
				fs.writeFile(errorFile, error, function(err) {  });
				console.error(error);
		}
	})

	socket.on('disconnect', async () => {
			const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

			idSocket = socket.id;

			users_found = users.filter(user => user.socket_id == idSocket);
			clients_found = clients.filter(client => client.socket_id == idSocket);

			if (users_found.length > 0) {
					users = users.filter(user => user.socket_id != idSocket); // remove from array

					console.log("Disconnected USER {"+idSocket+"}, count users connected now: "+Object.keys(users).length);
			} else if (clients_found.length > 0) {
					const client_id = clients_found[0].client_id;

					console.log("Disconnected CLIENT {socket: "+idSocket+", client_id: "+client_id+"}");
					clients = clients.filter(client => client.socket_id != idSocket); // remove from array

					console.log("Waiting for 5 secs, just in case it was internet down, we won't set offline.");
					await snooze(5000);

					const client_still_connected = clients.filter(client => client.client_id == client_id); // now we try to find by client_id, just in case he reconnected with another session id.

					if (client_still_connected.length == 0) {
							try {
									const response = await axios.get(baseUrlApi + '/restaurantes/nodeSetaClienteOffline/' + client_id);
									if (response.data.status != 'ok') {
											let msgError = new Date() + ' - error on setting client {socket: '+idSocket+', client_id: '+client_id+'} offline\n';
											fs.writeFile(errorFile, msgError, function(err) {       });

											console.error(msgError);
											return false;
									}

									io.sockets.emit("client-change-status", {
											'socket_id': socket.id,
											'client_id': client_id,
											'status': 'disconnect'
									});
									console.log("Client {socket: "+idSocket+", client_id: "+client_id+"} really disconnected more than 5 secs. OK");
							} catch (error) {
									fs.writeFile(errorFile, error, function(err) {  });
									console.error(error);
							}
					} else {
							console.log("Client reconnected with {socket: "+client_still_connected[0].socket_id+", client_id: "+client_still_connected[0].client_id+"}");
					}

			} else {
					let msgError = new Date() + ' - WARNING: Disconnected SESSION {'+idSocket+'}, but wasn\'t user neither client!\n';
					fs.writeFile(errorFile, msgError, function(err) {       });
					console.error(msgError);
			}
	});
});

function searchSessionIds(idCliente) {
		var achou = false;
		var sessions_id = [];
		clients.forEach(function(value, key) {
				if (value.client_id == idCliente) {
						achou = true;
						sessions_id.push(value.socket_id);
				}
		});
		if (achou === false) {
				return false
		} else {
				return sessions_id;
		}
}



