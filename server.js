'use strict';

const express = require('express');
const mongo = require('mongodb').MongoClient;
const path = require('path');
const Client = require('node-rest-client').Client;
const client = new Client();

const dbURL = `mongodb://${process.env.USER}:${process.env.PASSWORD}` + 
      `@ds1${process.env.SECRET}.mlab.com:${process.env.SECRET}/${process.env.DB_NAME}`;
const reqBase = `https://www.googleapis.com/customsearch/v1?key=${process.env.API_KEY}&cx=${process.env.CSE_ID}&searchType=image&num=10&q=`;

const app = express();

var db;
mongo.connect(dbURL, (err, database) => {
    if(err) throw err;
    db = database;
    app.listen(3000);
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(`${__dirname}/index.html`));
});

app.get('/history', function (req, res) {
    const history = db.collection('request-history');
    history.findOne({_id: 'history'}, (err, doc) => {
        if (err) throw err;
        doc
            ? res.send(doc.latest)
            : res.send([]);
    });
});

app.get('/imagesearch/:query', (req, res) => {
    const origSearchStr = req.params.query.trim();
    const googleQueryStr = origSearchStr.replace(/\s+/g,'+');

    if (!googleQueryStr) {
        return res.send({error: 'Search string is empty'});
    }

    const paginate = req.query.offset && req.query.offset !== '0'
        ? `&start=${req.query.offset}`
        : '';
    const apisearch = reqBase + googleQueryStr + paginate;
    const apireq = client.get(apisearch, data => {
        res.send(parseGoogleCSEApiResponse(data));
    });

    apireq.on('error', err => {
        res.send({error: err});
    });

    // Saving history
    const history = db.collection('request-history');
    history.findOne({_id: 'history'}, (err, doc) => {
        if (err) throw err;
        if (!doc) {
            history.insert(
                {
                    _id: 'history',
                    latest: updateSearchHistory([], origSearchStr)
                }
            );
        } else {
            history.update(
                { _id: 'history' },
                { latest: updateSearchHistory(doc.latest, origSearchStr) }
            );
        }
    });

});

function parseGoogleCSEApiResponse(res) {
    return res.items
        ? res.items.map(el => {
            return {
                url: el.link,
                snippet: el.snippet,
                thumbnail: el.image.thumbnailLink,
                context: el.image.contextLink
            };
        })
        : {error: 'Response error'};
}

function updateSearchHistory(history, searchStr) {
    const d = new Date;
    const newItem = {query: searchStr, date: `${d}`};
    let historyClone = history ? history.slice(0) : [];
    historyClone.unshift(newItem);
    return historyClone.slice(0, historyClone.length > 10
        ? 10
        : historyClone.length);
}