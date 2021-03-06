"use strict";

const http = require("http");
const WebSocket = require("ws");
const httpServerEngine = require("./httpServerEngine.js").httpServerEngine;

const EVENTS = { 
    ONLINECLIENTS: 0
    , SCORE: 1
    , NEWSQUARE: 2
    , HIT: 3
    , CLICK: 4
};

const PORT = process.env.PORT || 5000;
const PING_TIMEOUT = 10000;
const MAX_SQUARES = 5;
const MIN_WIDTH = 10; // px
const MIN_HEIGHT = 10; // px

const HttpServer = new http.createServer(httpServerEngine).listen(PORT);

const WebSocketServer = WebSocket.Server;

const wss = new WebSocketServer({ server: HttpServer });

wss.on('connection', (ws) => {
    ws.id = (Math.random()).toString().substring(2);
    ws.alive = true;
    ws.score = 0;

    console.log('Connected ws.id: ' + ws.id);
    sendOnlineClients();

    ws.on('pong', () => { 
        console.log('pong ws.id: ' + ws.id);
        ws.alive = true;
    });
    
    ws.on('close', () => { 
        console.log('disconnected ws.id: ' + ws.id);
        sendOnlineClients();
    });

    ws.onmessage = (event) => {
        let message = new Uint16Array(event.data.length / Uint16Array.BYTES_PER_ELEMENT);
        
        message = bufferToUint16Array(event.data);
        
        messageRouter(ws, message);
    };

    for(let squareId in squares) {
        ws.send(squares[squareId]);
    }
    ws.lastMessageTime = Date.now();
});

const bufferToUint16Array = (data) => {
    let message = new Uint16Array(data.length / Uint16Array.BYTES_PER_ELEMENT);
    
    let viewIndex = 0;
    for (let bufferIndex = 0; bufferIndex < data.length; bufferIndex += message.BYTES_PER_ELEMENT) {
        message[viewIndex] = data.readUInt16LE(bufferIndex);
        viewIndex++;
    }
    
    return message;
};

const messageRouter = (ws, message) => {
    //console.log(message);
    switch (message[0]) {
        case EVENTS.CLICK:
            click(ws, message[1], message[2]);
            break;
        default:
            console.log(`Unknown message: ${message}`);
    }
};

let squares = {};

const sendNewSquare = () => {
    if(Object.keys(squares).length >= MAX_SQUARES) {
        return false;
    }
    
    let squareId = parseInt((Math.random()).toString().substring(2, 6), 10);
    let square = new Uint16Array([
        EVENTS.NEWSQUARE
        , squareId
        , parseInt(Math.random() * 100 * 5) // x
        , parseInt(Math.random() * 100 * 5) // y
        , parseInt(MIN_WIDTH + Math.random() * 100) // width
        , parseInt(MIN_HEIGHT + Math.random() * 100) // height
    ]);
    squares[squareId] = square;
    
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(square);
            ws.lastMessageTime = Date.now();
        }
    });
};

// Init squares
for(let i = 0; i <= MAX_SQUARES; i++) {
    sendNewSquare();
}

const click = (ws, x, y) => {
    console.log(`click: ${ws.id} (${x}, ${y})`);
    
    let oldScore = ws.score;
    
    for(let squareId in squares) {
        //console.log(`${squares[squareId][0]} - ${squares[squareId][0]} ${squares[squareId][2]}`);
        //console.log(`${squares[squareId][1]} - ${squares[squareId][0]} ${squares[squareId][3]}`);
        if(x > squares[squareId][2] 
                && x < squares[squareId][2] + squares[squareId][4]
                && y > squares[squareId][3]
                && y < squares[squareId][3] + squares[squareId][5]
            ) {
            console.log(`hit ws.id: ${ws.id}`);
            
            delete squares[squareId];

            ws.score += 1;
            
            let score = new Uint16Array([ EVENTS.SCORE, ws.score ]);
            ws.send(score);
            
            let hit = new Uint16Array([ EVENTS.HIT, squareId ]);
            wss.clients.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(hit);
                    ws.lastMessageTime = Date.now();
                }
            });            
            
            setInterval(sendNewSquare, 1000);
            
            break;
        }
    }
    
    if(oldScore === ws.score) {
        console.log(`wuuuuuu ws.id: ${ws.id}`);
    }
};

const sendOnlineClients = () => {
    let onlineClients = new Uint16Array([ EVENTS.ONLINECLIENTS, wss.clients.size ]);
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(onlineClients);
            ws.lastMessageTime = Date.now();
        }
    });    
};

const pingClients = () => {
    wss.clients.forEach(ws => {
        if(ws.alive === false) {
            ws.terminate();
            return;
        }
        
        if(ws.lastMessageTime < (Date.now() - PING_TIMEOUT)) {
            console.log("ping ws.id: " + ws.id);
            ws.ping();
            ws.alive = false;
            ws.lastMessageTime = Date.now();
        }
    });
};

const pingInterval = setInterval(pingClients, 10000);