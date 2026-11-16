/** Authored interactions and rewards; objective counters and prerequisites live in the selected provider. */
export const quests = [
  { id:'quay-debt', title:'The Cartographer’s Debt', requires:'', reward:'hook-spear', stages:[
    ['market-account','flood-market','Ask the market trader about the missing cart.'], ['quay-tracks','old-quay','Trace the cart along the quay.'], ['market-settlement','flood-market','Return the account to the trader.'] ] },
  { id:'ferry-lanterns', title:'Lanterns for the Crossing', requires:'', reward:'reed-bow', stages:[
    ['ferry-lantern','reed-ferry','Offer to repair the ferry lanterns.'], ['shrine-oil','silt-shrine','Recover oil from the shrine.'], ['ferry-light','reed-ferry','Light the ferry crossing.'] ] },
  { id:'foundry-medicine', title:'A Measure of Mercy', requires:'', reward:'healing-draught', stages:[
    ['rest-patients','miners-rest','Ask Sable about the injured workers.'], ['cairn-herbs','wind-cairn','Gather wind-cairn herbs.'], ['rest-medicine','miners-rest','Deliver the medicine.'] ] },
  { id:'pilgrim-bell', title:'The Silent Bell', requires:'', reward:'pilgrim-coat', stages:[
    ['gate-pilgrims','pilgrim-gate','Speak with the waiting pilgrims.'], ['basilica-clapper','empty-basilica','Recover the bell clapper.'], ['gate-bell','pilgrim-gate','Return the clapper to the pilgrims.'] ] },
  { id:'orchard-witness', title:'Witness Among the Reeds', requires:'ferry-lanterns', reward:'salt-bomb', stages:[
    ['orchard-witness','salt-orchard','Find the orchard witness.'], ['archive-copy','drowned-archive','Make a copy of the testimony.'], ['ferry-witness','reed-ferry','Bring the witness home.'] ] },
  { id:'conductor-pact', title:'The Conductor’s Pact', requires:'foundry-medicine', reward:'conductor-mail', stages:[
    ['foundry-plans','bell-foundry','Collect the workers’ conductor plans.'], ['switchback-wire','switchback','Salvage the switchback wire.'], ['foundry-pact','bell-foundry','Deliver the wire to the workers.'] ] },
  { id:'collector-record', title:'The Collector’s Record', requires:'quay-debt', reward:'brine-tonic', stages:[
    ['steps-cache','ossuary-steps','Find the collector’s hidden cache.'], ['market-ledger','flood-market','Compare the cache with the market ledger.'], ['hall-record','ledger-hall','Place the corrected record in the hall.'] ] },
  { id:'names-vigil', title:'A Vigil for Names', requires:'pilgrim-bell', reward:'vigil-blade', stages:[
    ['basilica-vigil','empty-basilica','Arrange a vigil in the basilica.'], ['archive-names','drowned-archive','Recover names for the vigil.'], ['basilica-names','empty-basilica','Read the names at the vigil.'] ] },
] as const;

export const items: Readonly<Record<string, { name:string; description:string; slot?:'weapon'|'armor'; stackMax:number }>> = {
  basic:{name:'Basic blade',description:'A serviceable short blade.',slot:'weapon',stackMax:8},
  coat:{name:'Coat',description:'A simple travelling coat.',slot:'armor',stackMax:8},
  'salt-blade':{name:'Salt blade',description:'Adds one damage.',slot:'weapon',stackMax:1},
  'guard-coat':{name:'Guard coat',description:'Reduces incoming damage by one.',slot:'armor',stackMax:1},
  longbow:{name:'Longbow',description:'Attacks at range three.',slot:'weapon',stackMax:1},
  'hook-spear':{name:'Hook spear',description:'Attacks at range two.',slot:'weapon',stackMax:1},
  'reed-bow':{name:'Reed bow',description:'Attacks at range three.',slot:'weapon',stackMax:1},
  'vigil-blade':{name:'Vigil blade',description:'Adds two damage.',slot:'weapon',stackMax:1},
  'pilgrim-coat':{name:'Pilgrim coat',description:'Reduces incoming damage by one.',slot:'armor',stackMax:1},
  'conductor-mail':{name:'Conductor mail',description:'Reduces incoming damage by two.',slot:'armor',stackMax:1},
  'healing-draught':{name:'Healing draught',description:'Restore six health to a living party member.',stackMax:9},
  'brine-tonic':{name:'Brine tonic',description:'Restore one action point to a living actor in battle.',stackMax:9},
  'salt-bomb':{name:'Salt bomb',description:'Deal five damage to an enemy within range three.',stackMax:9},
};
