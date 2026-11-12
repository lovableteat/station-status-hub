// Reuse the reviewed transport without changing historical fixtures.
const original=require('../exact80/exact80-server.cjs');
const {BLOCKED_OLD}=require('./paths.cjs');
module.exports={...original,BLOCKED_OLD,createResearchServer:options=>original.createResearchServer({...options,blockedOld:BLOCKED_OLD})};
