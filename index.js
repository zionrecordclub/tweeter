const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({
    apiVersion: '2012-08-10'
});
const ssm = new AWS.SSM({
    apiVersion: '2014-11-06'
});
const Twitter = require('twitter');

const describeTableParams = {
    TableName: "tweets"
};
const ssmGetParametersParams = {
    Names: [
        '/dev/twitter/access-token',
        '/dev/twitter/access-token-secret',
        '/dev/twitter/account',
        '/dev/twitter/consumer-key',
        '/dev/twitter/consumer-secret'
    ],
    WithDecryption: true
};

exports.handler = (event, context, callback) => {
    setInterval(function() {}, 1000);
    context.callbackWaitsForEmptyEventLoop = false;
    //Callback functions
    const error = (err, response, body) => {
        console.log('ERROR [%s]', JSON.stringify(err));
        callback(err);
    };
    const cb = (error, data, response) => {
        if (error) callback(JSON.stringify(error));
        console.log('Data [%s]', data);
        callback(null, {
            statusCode: 200
        });
    };
    
    ssm.getParameters(ssmGetParametersParams, function(paramsErr, paramsData) {
        if (paramsErr) {
            callback(paramsErr);
            return;
        }
        dynamodb.describeTable(describeTableParams, function(err, descTableRes) {
            if (err) {
                callback(err);
                return;
            }
            const count = descTableRes.Table.ItemCount;
            if (count > 1) { // Must have more than an tweet index
                let getIndexParams = {
                    Key: {
                        "id": {
                            "S": '' + (-1)
                        }
                    },
                    TableName: "tweets"
                };
                dynamodb.getItem(getIndexParams, function(err2, getIndexRes) {
                    if (err2) {
                        callback(err2);
                        return;
                    }
                    const index = parseInt(getIndexRes.Item.status.S, 10);
                    const getItemParams = {
                        Key: {
                            "id": {
                                "S": '' + index
                            }
                        },
                        TableName: "tweets"
                    };
                    dynamodb.getItem(getItemParams, function(err3, getItemRes) {
                        if (err3) {
                            callback(err3);
                            return;
                        }
                        const putIndexParams = {
                            Item: {
                                id: {
                                    S: '-1'
                                },
                                status: {
                                    S: '' + (index + 1 > count - 2 ? 0 : index + 1)
                                }
                            },
                            TableName: "tweets"
                        };
                        dynamodb.putItem(putIndexParams, function(err4) {
                            if (err4) {
                                callback(err4);
                                return;
                            }
                            const tweet = {
                                status: getItemRes.Item.status.S
                            };
                            const twitter = new Twitter({
                                access_token_key: paramsData.Parameters[0].Value,
                                access_token_secret: paramsData.Parameters[1].Value,
                                consumer_key: paramsData.Parameters[3].Value,
                                consumer_secret: paramsData.Parameters[4].Value
                            });
                            
                            // Delete if exists and repost
                            twitter.get('search/tweets', {q: `from:${paramsData.Parameters[2].Value} "${tweet.status}"`}, (error, tweets, response) => {
                                console.log(JSON.stringify(tweets))
                                const list = tweets.statuses;
                                if (list.length) {
                                    const delId = list[0].id_str;
                                    twitter.post(`statuses/destroy/${delId}`, {id: delId}, () => {
                                        twitter.post('statuses/update', tweet, cb);
                                    });
                                } else {
                                    twitter.post('statuses/update', tweet, cb);
                                }
                            });
                        });
                    });
                });
            }
        });
    });
    
};
