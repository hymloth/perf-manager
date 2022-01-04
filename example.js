"use strict"

const Redis = require("ioredis");
const PerformanceManager = require("./index").PerformanceManager;

const redis = new Redis(); 
const perfManager = new PerformanceManager(redis);

const recordMetricSince = perfManager.recordMetricSince.bind(perfManager);


perfManager.registerMetric("myMetric", "Total myMetric duration");

let start = new Date();

//my heavy operation
for (let i=0; i<1000000000; i++) {
    // do something
}

recordMetricSince("myMetric", start);

// again
start = new Date();

//my heavy operation
for (let i=0; i<1000000000; i++) {
    // do something
}

recordMetricSince("myMetric", start);

perfManager.getStats("myMetric").then((stats) => console.log(stats)); // two stats, varying

perfManager.clearStats("myMetric");

perfManager.getStats("myMetric").then((stats) => console.log(stats));

