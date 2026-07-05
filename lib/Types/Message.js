"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WAMessageStatus = exports.WAMessageStubType = exports.WAProto = exports.WAMessageAddressingMode = void 0;
exports.WAMessageAddressingMode = { PN: 'pn', LID: 'lid' };
const WAProto_1 = require("../../WAProto");
Object.defineProperty(exports, "WAProto", { enumerable: true, get: function () { return WAProto_1.proto; } });
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
exports.WAMessageStubType = WAProto_1.proto.WebMessageInfo.StubType;
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
exports.WAMessageStatus = WAProto_1.proto.WebMessageInfo.Status;
