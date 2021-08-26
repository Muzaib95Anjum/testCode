(
    function (f) {
        if (typeof exports === "object" && typeof module !== "undefined") {
            module.exports = f()

        } else if (typeof define === "function" && define.amd) {
            define([], f)

        } else {
            var g;
            if (typeof window !== "undefined") {
                g = window

            } else if (typeof global !== "undefined") {
                g = global

            } else if (typeof self !== "undefined") {
                g = self

            } else {
                g = this

            }
            g.handler = f()

        }

    }
)(function () {
    var define, module, exports;
    return (function () {
        function r(e, n, t) {
            function o(i, f) {
                if (!n[i]) {
                    if (!e[i]) {
                        var c = "function" == typeof require && require;
                        if (!f && c) return c(i, !0);
                        if (u) return u(i, !0);
                        var a = new Error("Cannot find module '" + i + "'");
                        throw a.code = "MODULE_NOT_FOUND", a
                    }
                    var p = n[i] = {exports: {}};
                    e[i][0].call(p.exports, function (r) {
                        var n = e[i][1][r];
                        return o(n || r)
                    }, p, p.exports, r, e, n, t)
                }
                return n[i].exports
            }

            for (var u = "function" == typeof require && require, i = 0; i < t.length; i++) o(t[i]);
            return o
        }

        return r
    })()({
        1: [function (require, module, exports) {
            'use strict';
            const Fields = {
                customer: {
                    customerId: "N",
                    firstName: "S",
                    lastName: "S",
                    email: "S",
                    phone: "S",
                    address1: "S",
                    address2: "s",
                    city: "S",
                    region: "S",
                    postalCode: "S",
                    country: "S"
                },
                order: {orderNumber: "S", created: "S"},
                item: {
                    itemId: "s",
                    itemName: "S",
                    productId: "s",
                    productTitle: "S",
                    variantId: "S",
                    itemSerial: "S",
                    created: "S"
                }
            };
            module.exports = Fields;

        }, {}],
        2: [function (require, module, exports) {
            'use strict';
            const dynamodb = require("./lib/dynamodb"), lambda = require("./lib/lambda"),
                validate = require("./lib/validate"), generateSerialNumber = require("./lib/generateSerialNumber"),
                getSerialNumber = require("./lib/getSerialNumber"), GENERATE_FUNCTION = process.env.GENERATE_FUNCTION,
                Fields = require("./Fields"),
                extract = (body, fields) => Object.keys(fields).reduce((result, field) => ({[field]: body[field], ...result}), {});
            exports.handler = async event => {
                const body = JSON.parse(event.body.replace(/\\n/g, ""));
                console.log("Body : ", body);
                try {
                    if (!Array.isArray(body)) throw new Error("Payload needs to be an array");
                    body.reduce((result, item) => validate(item, Fields.order) && validate(item, Fields.item) && validate(item, Fields.customer) && result, !0)
                } catch (error) {
                    return {statusCode: 400, body: JSON.stringify({error: error.message})}
                }
                const promises = body.map(async item => {
                    const itemsCounts = [...Array(item.itemId.split(",").length).keys()],
                        items = itemsCounts.map((_, index) => Object.keys(Fields.item).reduce((result, field) => {
                            console.log("field, result : ", field, item[field], result);
                            const value = item[field].split(",");
                            return {[field]: value[index], ...result}
                        }, {}));
                    return console.log("items : ", items), await Promise.all([...items.reduce((result, _item) => {
                        const baseSerialNumber = generateSerialNumber(15),
                            serialNumber = getSerialNumber("" + baseSerialNumber);
                        return [dynamodb.insert({
                            ...extract(item, Fields.customer),
                            PK: serialNumber,
                            SK: "customer"
                        }).then(() => serialNumber), dynamodb.insert({
                            orderNumber: item.orderNumber,
                            created: item.created,
                            PK: serialNumber,
                            SK: "order"
                        }), dynamodb.insert({
                            ..._item,
                            created: item.created,
                            PK: serialNumber,
                            SK: "item",
                            orderNumber: item.orderNumber,
                            itemName: _item.productId ? _item.itemName : _item.productTitle + " " + _item.variantTitle
                        }), lambda.invoke(GENERATE_FUNCTION, {
                            orderNumber: item.orderNumber,
                            created: item.created, ...extract(item, Fields.customer),
                            serialNumber, ..._item
                        }), ...result]
                    }, [])]).then(results => results.filter(item => "string" == typeof item)).catch(error => {
                        console.log("Error : ", error.mesage)
                    })
                }), serials = await Promise.all(promises);
                return console.log("serials : ", serials.reduce((a, b) => a.concat(b), [])), {
                    statusCode: 200,
                    body: JSON.stringify({error: !1, serials: serials.reduce((a, b) => a.concat(b), [])})
                }
            };

        }, {
            "./Fields": 1,
            "./lib/dynamodb": 3,
            "./lib/generateSerialNumber": 4,
            "./lib/getSerialNumber": 5,
            "./lib/lambda": 6,
            "./lib/validate": 7
        }],
        3: [function (require, module, exports) {
            'use strict';
            const DynamoDB = require("aws-sdk").DynamoDB, parse = DynamoDB.Converter.unmarshall,
                tableName = process.env.DYNAMODB_TABLE,
                ddb = new DynamoDB({apiVersion: "2012-08-10", region: "us-east-2"}),
                docClient = new DynamoDB.DocumentClient({region: "us-east-2"}),
                query = (params, cacheName) => ddb.query({
                    ReturnConsumedCapacity: "TOTAL",
                    TableName: tableName, ...params
                }).promise().then(data => (console.info("ConsumedCapacity (Read): ", data.ConsumedCapacity), console.info("Records (Read): ", cacheName, data.Items.length), data.Items ? data.Items.map(item => parse(item)) : [])).catch(error => {
                    throw console.log("Error pulling data from DynamoDB : ", error.message, params), new Error("Error pulling data from DynamoDB : " + error.message)
                }).then(data => data), insert = body => docClient.put({TableName: tableName, Item: body}).promise(),
                scan = async () => {
                    const params = {TableName: tableName};
                    let items, results = [];
                    do items = await docClient.scan(params).promise(), results = [...results, ...items.Items], params.LastEvaluatedKey = items.LastEvaluatedKey; while ("undefined" != typeof items.LastEvaluatedKey);
                    return results
                };
            module.exports = {insert, query, scan};

        }, {"aws-sdk": undefined}],
        4: [function (require, module, exports) {
            'use strict';
            const generateSerialNumber = size => {
                let result = Math.random().toString().slice(2);
                for (; result.length < 3 * size;) result += Math.random().toString().slice(2);
                const pos = Math.floor(Math.random() * (result.length - size));
                return result.slice(pos, pos + size)
            };
            module.exports = generateSerialNumber;

        }, {}],
        5: [function (require, module, exports) {
            'use strict';
            const getChekSum = number => {
                const args = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];
                let value, len = number.length, bit = 0, sum = 0;
                for (; len;) value = parseInt(number.charAt(--len), 10), sum += (bit ^= 1) ? args[value] : value;
                return (1e3 - sum) % 10
            }, getSerialNumber = number => `K${"" + number}${getChekSum(number)}`;
            module.exports = getSerialNumber;

        }, {}],
        6: [function (require, module, exports) {
            'use strict';
            const AWS = require("aws-sdk"), lambda = new AWS.Lambda({region: "us-east-2"}),
                invoke = async (name, payload, InvocationType = "Event") => {
                    const params = {FunctionName: name, InvocationType, Payload: JSON.stringify(payload)};
                    return lambda.invoke(params).promise()
                };
            module.exports = {invoke};

        }, {"aws-sdk": undefined}],
        7: [function (require, module, exports) {
            'use strict';
            const validateExistance = (body, fields) => Object.keys(fields).reduce((valid, field) => {
                const result = valid && (field in body || "s" === fields[field]);
                if (!result) throw new Error(`Missing ${field}`);
                return valid
            }, !0), validateType = (body, fields) => {
                const keys = Object.keys(fields);
                let result;
                return keys.reduce((valid, field) => {
                    switch (fields[field]) {
                        case"s":
                            return valid && ("string" == typeof body[field] || body[field] instanceof String || !body[field]);
                        case"S":
                            if (result = "string" == typeof body[field] || body[field] instanceof String, !result) throw new Error(`${field} should be String`);
                            return valid && result;
                        case"N":
                            if (result = !isNaN(body[field]) && parseInt(+body[field]) == body[field] && !isNaN(parseInt(body[field], 10)), !result) throw new Error(`${field} should be Number`);
                            return valid && result;
                        default:
                    }
                    return valid
                }, !0)
            }, validate = (body, fields) => validateExistance(body, fields) && validateType(body, fields);
            module.exports = validate;

        }, {}]
    }, {}, [2])(2)
});
