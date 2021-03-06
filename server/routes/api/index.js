const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");

const {
  addUser,
  createPoll,
  getPoll,
  getPolls,
  getVotes,
  recordVote,
} = require("../../pollDb.js");
/*
const {
  addGroupMember,
  createGroup,
  recordConfession,
  getGroup,
  getGroups,
  getConfession,
  getConfessions,
} = require("../../confessionsDb.js");
*/
const {
  addGroupMember,
  createGroup,
  recordConfession,
  getGroups,
  getGroupHashes,
  getConfessions,
} = require("../../ethAPI.js");
const { verifyKey, verifySignature } = require("../../verifier");
const { mimcHash } = require("../../mimc.js");

const router = express.Router();
const jsonParser = bodyParser.json();

router.post("/write", jsonParser, async (req, res) => {
  const { path, data } = req.body;
  await fs.writeFile(__dirname + "/../../../" + path, data, () => {});
  res.send({ success: true });
});

router.post("/groups/create", jsonParser, async (req, res) => {
  const { name } = req.body;
  const { password } = await createGroup(name);
  res.send({ success: true, password });
});

router.post("/groups/register", jsonParser, async (req, res) => {
  const { name, keyProof, passwordProof } = req.body;
  const registration = await addGroupMember(
    name,
    keyProof.proof,
    keyProof.publicSignals,
    passwordProof.proof,
    passwordProof.publicSignals
  );
  res.send({ success: registration });
});

router.post("/confessions/post", jsonParser, async (req, res) => {
  const { message, proof, group } = req.body;
  const confession = await recordConfession(
    message,
    proof.proof,
    proof.publicSignals,
    group
  );
  res.send({ success: true, confession });
});

/*
router.get("/confessions/:id", async (req, res) => {
  const id = req.params.id;
  const confession = await getConfession(id);
  res.send({ success: true, confession });
});
*/

router.get("/groups/:name", async (req, res) => {
  const name = req.params.name;
  const hashes = await getGroupHashes(name);
  res.send({ success: true, hashes });
});

router.get("/confessions", jsonParser, async (req, res) => {
  const confessions = await getConfessions();
  res.send({ success: true, confessions });
});

router.get("/groups", jsonParser, async (req, res) => {
  const groups = await getGroups();
  res.send({ success: true, groups });
});

router.post("/polls/new", jsonParser, async (req, res) => {
  const { title, maxUsers } = req.body;
  const polls = await createPoll(title, maxUsers);
  res.send({ success: true, polls });
});

router.get("/polls/:id", async (req, res) => {
  const id = req.params.id;
  const poll = await getPoll(id);
  const votes = await getVotes(id);
  res.send({ success: true, poll, votes });
});

router.get("/polls", jsonParser, async (req, res) => {
  const polls = await getPolls();
  res.send({ success: true, polls });
});

router.post("/polls/register_key", jsonParser, async (req, res) => {
  const { id, keyHash } = req.body;
  addUser(id, keyHash);
  res.send({ success: true });
});

router.post("/polls/:id/vote", jsonParser, async (req, res) => {
  const id = req.params.id;
  const { sigProof } = req.body;
  const { proof, publicSignals } = sigProof;
  const voteBits = publicSignals.slice(
    publicSignals.length - 312,
    publicSignals.length
  );
  const vote = voteBits.join("");
  const validSignature = await verifySignature(proof, publicSignals);
  if (validSignature) {
    // send to solidity
    await recordVote(id, vote, publicSignals[publicSignals.length - 2]);
    res.send({ success: true });
  } else {
    res.send({ error: "Invalid signature" });
  }
});

module.exports = {
  apiRouter: router,
};
