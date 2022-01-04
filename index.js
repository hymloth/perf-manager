"use strict";


const MAX_SAMPLES = 20000;

const performanceAddLuaScript = `
    local key = KEYS[1]

    local samplesKey = key .. "_samples"
    local timestampsKey = key .. "_timestamps"

    local elapsed = tonumber(ARGV[1])
    local timestamp = tonumber(ARGV[2])
    local pruneThreshold = tonumber(ARGV[3])

    local listLen = redis.call("RPUSH", samplesKey, elapsed)
    redis.call("RPUSH", timestampsKey, timestamp)

    if listLen > 2 * pruneThreshold then
        redis.call("LTRIM", samplesKey, -pruneThreshold, -1)
        redis.call("LTRIM", timestampsKey, -pruneThreshold, -1)
    end
`


class PerformanceManager {

    constructor (redisClient) {
        this.metrics = {};
        this.redisClient = redisClient;
        this.redisClient.defineCommand("performance_add", {
            numberOfKeys: 1,
            lua: performanceAddLuaScript
        });
    }


    luaRun (command, keys, args) {
        return new Promise((resolve) => {
            this.redisClient[command](keys, args, resolve);
        });
    } 


    key (action, type) {
        return action + "_" + type;
    }


    registerMetric (metricName, description, parentMetricName) {
        const parentMetric = this.metrics[parentMetricName];

        const metric = {
            name: metricName,
            description: description,
            parent: parentMetric,
            children: []
        };

        this.metrics[metricName] = metric;

        if (parentMetric) {
            parentMetric.children.push(metric);
        }
    }


    getMetrics (parentName) {
        if (!parentName) {
            return Object.keys(this.metrics);
        }

        const parent = this.metrics[parentName];

        if (parent) {
            const keys = [];
            (parent.children).each(function (child) {
                keys.push(child.name);
            });

            return keys;
        }

        return [];
    }


    getMetric (metricName) {
        return this.metrics[ metricName ];
    }


    getMetricChildren (metricName) {
        return this.metrics[ metricName ].children;
    }


    keyForMetric (metricName) {
        return "monitor_" + metricName;
    }

    
    recordMetric (metric, elapsed) {
        const d = new Date();
        this.luaRun("performance_add", [
                this.keyForMetric(metric)],
            [elapsed, d.getTime(), MAX_SAMPLES]
        );

        return d;
    }


    recordMetricSince (metric, start) {
        const d = new Date();
        const elapsed = d - start;

        this.luaRun("performance_add", [
                this.keyForMetric(metric)],
            [elapsed, d.getTime(), MAX_SAMPLES]
        );

        return d;
    }


    getStats (action) {
        const self = this;
        const samplesKey = this.key(this.keyForMetric(action), "samples");
        const timestampsKey = this.key(this.keyForMetric(action), "timestamps");

        return Promise.all([
            self.redisClient.lrange(samplesKey, 0, -1),
            self.redisClient.lrange(timestampsKey, 0, -1)
        ])
        .then(function (res) {
            const holder = res[0];
            const timestamps = res[1];

            if (!holder || !timestamps) {
                return null;
            }

            let min = Number.MAX_VALUE;
            let max = 0;
            let cardinality = holder.length;
            let sum = 0;

            if (cardinality === 0) {
                return null;
            }

            holder.forEach(function (res) {
                sum += parseInt(res);

                if (parseInt(res) < min) {
                    min = res;
                }

                if (parseInt(res) > max) {
                    max = res;
                }

            });

            const avg = sum / cardinality;

            return { 
                actionType: action, 
                min: Math.round(min), 
                max: Math.round(max), 
                avg: Math.round(avg), 
                cardinality: cardinality
            };
        });

    }


    clearStats (action) {
        const samplesKey = this.key(this.keyForMetric(action), "samples");
        const timestampsKey = this.key(this.keyForMetric(action), "timestamps");

        return Promise.all([
            this.redisClient.del(samplesKey, 0, -1),
            this.redisClient.del(timestampsKey, 0, -1)
        ]);
    }
}


exports.PerformanceManager = PerformanceManager;