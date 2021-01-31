const mangoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const redisurl = "redis://localhost:6379";
const client = redis.createClient(redisurl);
client.hget = util.promisify(client.hget);
const exec = mangoose.Query.prototype.exec;

//add your custom function, to control whether you
//want to implement cache for query or not
mangoose.Query.prototype.cached = function(options = {}) {
    this.useCache = true;
    this.useHashKey = JSON.stringify(options.key || '');
    //to make function chainable
    return this;
}

mangoose.Query.prototype.exec = async function() {

    if(!this.useCache) {
        return await exec.apply(this, arguments);
    }
    console.log('I am about to run a query');

    console.log(this.getQuery());
    console.log(this.mongooseCollection.name);

    //we dont want to modify existing query object to create cache key, just copy the object
    const key = JSON.stringify(Object.assign({}, this.getQuery(), {collection: this.mongooseCollection.name}));

    //see if the key is avaiable in cache
    const cacheValue = await client.hget(this.useHashKey, key);

    //if cache is there, return from there
    if(cacheValue) {
       console.log(cacheValue);
     const doc = JSON.parse(cacheValue);
     return Array.isArray(doc) ?  doc.map(d => new this.model(d)) : new this.model(doc);       
    }

    //return original mangoose library function
    const result = await exec.apply(this, arguments);

    //store the data into cache
    //expire in 10 seconds
    client.hmset(this.useHashKey, key, JSON.stringify(result), 'EX', 10);
    return result;
}

module.exports = {
    clearCache(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}