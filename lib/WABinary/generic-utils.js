"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdditionalNode = exports.getBinaryNodeFilter = exports.binaryNodeToString = exports.getBinaryNodeMessages = exports.reduceBinaryNodeToDictionary = exports.assertNodeErrorFree = exports.getBinaryNodeChildUInt = exports.getBinaryNodeChildString = exports.getBinaryNodeChildBuffer = exports.getBinaryNodeChild = exports.getAllBinaryNodeChildren = exports.getBinaryNodeChildren = void 0;
const boom_1 = require("@hapi/boom");
const WAProto_1 = require("../../WAProto");
const Utils_1 = require("../Utils")
// some extra useful utilities
// caches children-by-tag lookups per node so repeatedly calling
// getBinaryNodeChildren/getBinaryNodeChild on the same node (very common when
// parsing a stanza with multiple helper calls) doesn't re-scan node.content
// every time. WeakMap means cached entries disappear once the node itself is
// garbage collected - no manual cleanup needed.
const childrenByTagCache = new WeakMap();
const getChildrenByTag = (node) => {
    if (!Array.isArray(node?.content)) {
        return null;
    }
    let byTag = childrenByTagCache.get(node);
    if (!byTag) {
        byTag = new Map();
        for (const item of node.content) {
            const tag = item?.tag;
            if (!tag) {
                continue;
            }
            let list = byTag.get(tag);
            if (!list) {
                list = [];
                byTag.set(tag, list);
            }
            list.push(item);
        }
        childrenByTagCache.set(node, byTag);
    }
    return byTag;
};
const getBinaryNodeChildren = (node, childTag) => {
    const byTag = getChildrenByTag(node);
    return byTag?.get(childTag) || [];
}
exports.getBinaryNodeChildren = getBinaryNodeChildren;
const getAllBinaryNodeChildren = ({ content }) => {
    if (Array.isArray(content)) {
        return content
    }
    return []
}
exports.getAllBinaryNodeChildren = getAllBinaryNodeChildren;
const getBinaryNodeChild = (node, childTag) => {
    const byTag = getChildrenByTag(node);
    return byTag?.get(childTag)?.[0];
}
exports.getBinaryNodeChild = getBinaryNodeChild;
const getBinaryNodeChildBuffer = (node, childTag) => {
    const child = getBinaryNodeChild(node, childTag)?.content
    if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
        return child
    }
}
exports.getBinaryNodeChildBuffer = getBinaryNodeChildBuffer;
const getBinaryNodeChildString = (node, childTag) => {
    const child = getBinaryNodeChild(node, childTag)?.content
    if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
        return Buffer.from(child).toString('utf-8')
    }
    else if (typeof child === 'string') {
        return child
    }
}
exports.getBinaryNodeChildString = getBinaryNodeChildString;
const getBinaryNodeChildUInt = (node, childTag, length) => {
    const buff = getBinaryNodeChildBuffer(node, childTag)
    if (buff) {
        return bufferToUInt(buff, length)
    }
}
exports.getBinaryNodeChildUInt = getBinaryNodeChildUInt;
const assertNodeErrorFree = (node) => {
    const errNode = getBinaryNodeChild(node, 'error')
    if (errNode) {
        throw new boom_1.Boom(errNode.attrs.text || 'Unknown error', { data: +errNode.attrs.code })
    }
}
exports.assertNodeErrorFree = assertNodeErrorFree;
const reduceBinaryNodeToDictionary = (node, tag) => {
    const nodes = getBinaryNodeChildren(node, tag)
    const dict = nodes.reduce((dict, { attrs }) => {
        dict[attrs.name || attrs.config_code] = attrs.value || attrs.config_value
        return dict
    }, {})
    return dict
}
exports.reduceBinaryNodeToDictionary = reduceBinaryNodeToDictionary;
const getBinaryNodeMessages = ({ content }) => {
    const msgs = []
    if (Array.isArray(content)) {
        for (const item of content) {
            if (item.tag === 'message') {
                msgs.push(WAProto_1.proto.WebMessageInfo.decode(item.content))
            }
        }
    }
    return msgs
}
exports.getBinaryNodeMessages = getBinaryNodeMessages;
function bufferToUInt(e, t) {
    let a = 0;
    for (let i = 0; i < t; i++) {
        a = 256 * a + e[i];
    }
    return a;
}
const tabs = (n) => '\t'.repeat(n);
function binaryNodeToString(node, i = 0) {
    if (!node) {
        return node;
    }
    if (typeof node === 'string') {
        return tabs(i) + node;
    }
    if (node instanceof Uint8Array) {
        return tabs(i) + Buffer.from(node).toString('hex');
    }
    if (Array.isArray(node)) {
        return node.map((x) => tabs(i + 1) + binaryNodeToString(x, i + 1)).join('\n');
    }
    const children = binaryNodeToString(node.content, i + 1);
    const tag = `<${node.tag} ${Object.entries(node.attrs || {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}='${v}'`)
        .join(' ')}`;
    const content = children ? `>\n${children}\n${tabs(i)}</${node.tag}>` : '/>';
    return tag + content;
}
exports.binaryNodeToString = binaryNodeToString;
const getBinaryNodeFilter = (node) => {
   if (!Array.isArray(node)) return false
   
   return node.some(item => 
      ['native_flow'].includes(item?.content?.[0]?.content?.[0]?.tag) ||
      ['interactive', 'buttons', 'list'].includes(item?.content?.[0]?.tag) ||
      ['hsm', 'biz'].includes(item?.tag) ||
      ['bot'].includes(item?.tag) && item?.attrs?.biz_bot === '1'
   )
}
exports.getBinaryNodeFilter = getBinaryNodeFilter;
const getAdditionalNode = (name) => {
   if (name) name = name.toLowerCase()
   const ts = Utils_1.unixTimestampSeconds(new Date()) - 77980457
   
   const order_response_name = {
      review_and_pay: 'order_details',
      review_order: 'order_status',
      payment_info: 'payment_info',
      payment_status: 'payment_status',
      payment_method: 'payment_method'
   }

   const flow_name = {
      cta_catalog: 'cta_catalog',
      mpm: 'mpm',
      call_request: 'call_permission_request',
      view_catalog: 'automated_greeting_message_view_catalog',
      wa_pay_detail: 'wa_payment_transaction_details',
      send_location: 'send_location',
      // speculative - blm ada konfirmasi resmi nama native_flow-nya, tebakan berdasarkan pola yg udah ada
      payment_key_info: 'wa_payment_key_info',
   }

   if (name === 'catalog_message') {
       // list message isi produk katalog -> beda struktur dari native_flow, node <list> bukan <interactive>
       return [{
           tag: 'biz',
           attrs: {},
           content: [{
               tag: 'list',
               attrs: {
                   type: 'product_list',
                   v: '2'
               },
               content: []
           }]
       }]
   } else if(order_response_name[name]) {
       return [{
           tag: 'biz',
           attrs: { 
               native_flow_name: order_response_name[name] 
           },
           content: []
       }]
   } else if (flow_name[name] || name === 'interactive' || name === 'buttons') {
       return [{
           tag: 'biz',
           attrs: { 
               actual_actors: '2',
               host_storage: '2',
               privacy_mode_ts: `${ts}`
           },
           content: [{
               tag: 'engagement',
               attrs: {
                   customer_service_state: 'open',
                   conversation_state: 'open'
               }
           }, {
               tag: 'interactive',
               attrs: {
                   type: 'native_flow',
                   v: '1'
               },
               content: [{
                   tag: 'native_flow',
                   attrs: { 
                       v: '9',
                       name: flow_name[name] ?? 'mixed',
                   },
                       content: []
                   }]
               }]
           }]
   } else {
         return [{
         tag: 'biz',
         attrs: {
            actual_actors: '2',
            host_storage: '2',
            privacy_mode_ts: `${ts}`
         },
         content: [{
            tag: 'engagement',
            attrs: {
               customer_service_state: 'open',
               conversation_state: 'open'
            }
         }]
      }]
   }
}
exports.getAdditionalNode = getAdditionalNode;
