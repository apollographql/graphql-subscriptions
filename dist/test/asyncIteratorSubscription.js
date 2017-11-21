"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var sinon_1 = require("sinon");
var sinonChai = require("sinon-chai");
var iterall_1 = require("iterall");
var pubsub_1 = require("../pubsub");
var with_filter_1 = require("../with-filter");
chai.use(chaiAsPromised);
chai.use(sinonChai);
var expect = chai.expect;
var graphql_1 = require("graphql");
var subscription_1 = require("graphql/subscription");
var FIRST_EVENT = 'FIRST_EVENT';
var defaultFilter = function (payload) { return true; };
function buildSchema(iterator, filterFn) {
    if (filterFn === void 0) { filterFn = defaultFilter; }
    return new graphql_1.GraphQLSchema({
        query: new graphql_1.GraphQLObjectType({
            name: 'Query',
            fields: {
                testString: {
                    type: graphql_1.GraphQLString,
                    resolve: function (_, args) {
                        return 'works';
                    },
                },
            },
        }),
        subscription: new graphql_1.GraphQLObjectType({
            name: 'Subscription',
            fields: {
                testSubscription: {
                    type: graphql_1.GraphQLString,
                    subscribe: with_filter_1.withFilter(function () { return iterator; }, filterFn),
                    resolve: function (root) {
                        return 'FIRST_EVENT';
                    },
                },
            },
        }),
    });
}
describe('GraphQL-JS asyncIterator', function () {
    it('should allow subscriptions', function () { return __awaiter(_this, void 0, void 0, function () {
        var query, pubsub, origIterator, schema, results, payload1, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = graphql_1.parse("\n      subscription S1 {\n\n        testSubscription\n      }\n    ");
                    pubsub = new pubsub_1.PubSub();
                    origIterator = pubsub.asyncIterator(FIRST_EVENT);
                    schema = buildSchema(origIterator);
                    return [4, subscription_1.subscribe(schema, query)];
                case 1:
                    results = _a.sent();
                    payload1 = results.next();
                    expect(iterall_1.isAsyncIterable(results)).to.be.true;
                    r = payload1.then(function (res) {
                        expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
                    });
                    pubsub.publish(FIRST_EVENT, {});
                    return [2, r];
            }
        });
    }); });
    it('should detect when the payload is done when filtering', function (done) {
        var query = graphql_1.parse("\n      subscription S1 {\n        testSubscription\n      }\n    ");
        var pubsub = new pubsub_1.PubSub();
        var origIterator = pubsub.asyncIterator(FIRST_EVENT);
        var counter = 0;
        var filterFn = function () {
            counter++;
            if (counter > 10) {
                var e = new Error('Infinite loop detected');
                done(e);
                throw e;
            }
            return false;
        };
        var schema = buildSchema(origIterator, filterFn);
        Promise.resolve(subscription_1.subscribe(schema, query)).then(function (results) {
            expect(iterall_1.isAsyncIterable(results)).to.be.true;
            results.next();
            results.return();
            pubsub.publish(FIRST_EVENT, {});
            setTimeout(function (_) {
                done();
            }, 500);
        });
    });
    it('should clear event handlers', function () { return __awaiter(_this, void 0, void 0, function () {
        var query, pubsub, origIterator, returnSpy, schema, results, end, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = graphql_1.parse("\n      subscription S1 {\n        testSubscription\n      }\n    ");
                    pubsub = new pubsub_1.PubSub();
                    origIterator = pubsub.asyncIterator(FIRST_EVENT);
                    returnSpy = sinon_1.spy(origIterator, 'return');
                    schema = buildSchema(origIterator);
                    return [4, subscription_1.subscribe(schema, query)];
                case 1:
                    results = _a.sent();
                    end = results.return();
                    r = end.then(function (res) {
                        expect(returnSpy).to.have.been.called;
                    });
                    pubsub.publish(FIRST_EVENT, {});
                    return [2, r];
            }
        });
    }); });
});
//# sourceMappingURL=asyncIteratorSubscription.js.map