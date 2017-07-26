"use strict";

const request = require("request");
const async = require("async");
const key = require("./atlassian-connect").key;
<<<<<<< HEAD
const url = require("url");

// Returns the full link to the JIRA Ticket that is referenced in the request object
function getJiraTicketLink(req, ticketId) {
  var issueId = req.query.issue;
  var baseJiraURL = null;
  if(req.headers["xdm_e"]) {
    baseJiraURL = req.headers["xdm_e"];
  } else {
    // lets see if we have a comment.self
    if(req.body.comment && req.body.comment.self) {
      baseJiraURL = req.body.comment.self;
    }
  }
  if(baseJiraURL == null) baseJiraURL = "http://yourjiraserver.com/browse/";
  var parsedUrl = url.parse(baseJiraURL);
  return `${parsedUrl.protocol}//${parsedUrl.host}/browse/${ticketId}`;
}
=======
const escape = require("escape-html");
>>>>>>> master

function getTenant(req, httpClient, cb) {
  httpClient.get({
    uri: `/rest/atlassian-connect/1/addons/${key}/properties/tenant`,
    json: true,
  }, (err, ires, body) => {
    if (err) { return cb(err); }
    req.tenant = body.value;
    cb(null, req.tenant);
  });
}

function getPid(req, httpClient, cb) {
  if (req.query.issue) {
    httpClient.get({
      uri: `/rest/api/2/issue/${req.query.issue}/properties/dynatraceProblemId`,
      json: true,
    }, (err, ires, body) => {
      if (err) { return cb(err); }
      req.pid = body.value;
      cb(null, req.pid);
    });
  } else {
    cb();
  }
}

function getProblemDetails(tenant, token, pid, cb) {
  request.get({
    uri: `${tenant}/api/v1/problem/details/${pid}`,
    headers: {
      Authorization: `Api-Token ${token}`,
    },
    json: true,
  }, cb);
}

/**
 * Adds a comment to the Dynatrace Problem
 * @param {string} tenant Dynatrace Tenant URL
 * @param {string} token Dynatrace API Token
 * @param {string} pid 
 * @param {string} comment 
 * @param {string} user 
 * @param {string} context 
 * @param {string} jiraTicketLink 
 * @param {function} cb 
 */
function addProblemComment(tenant, token, pid, comment, user, context, jiraTicketLink, cb) {
  // Lets build the comment string to first contain a link back to the JIRA Ticket
  comment = `Comment sync on [JIRA - ${context}](${jiraTicketLink})\n----------------------------------------\n${comment}`;
  var dtComment = {
    comment,
    user,
    context
  }
  var postUrl = `${tenant}/api/v1/problem/details/${pid}/comments`
  console.log("Dynatrace POST Url: " + postUrl) 
  request.post({
    uri: postUrl,
    headers: {
      Authorization: `Api-Token ${token}`,
    },
    body: dtComment,
    json: true,
  }, cb);
}

function getProblemComments(tenant, token, pid, cb) {
  request.get({
    uri: `${tenant}/api/v1/problem/details/${pid}/comments`,
    headers: {
      Authorization: `Api-Token ${token}`,
    },
    json: true,
  }, cb);
}

function getProblemDetailsWithComments(tenant, token, pid, cb) {
  async.parallel([
      acb => getProblemDetails(tenant, token, pid, acb),
      acb => getProblemComments(tenant, token, pid, acb),
  ], (e, results) => {
    if (e) { return cb(e); }

    if (!results[0][1] || !results[1][1]) {
      return cb();
    }

    if (results[0][0].statusCode !== 200) {
      console.log("Could not find problem");
      return cb();
    }

    const problem = results[0][1].result;

    if (results[1][0].statusCode !== 200) {
      console.log("Could not find comments");
      problem.comments = [];
      return cb(null, problem);
    }

    const comments = results[1][1].comments.map(c => {
      c.isComment = true;
      c.startTime = c.createdAtTimestamp;
      c.content = escape(c.content);
      c.content = c.content.replace(/(?:\r\n|\r|\n)/g, '<br />');
      return c;
    });;
    problem.comments = comments;
    cb(null, problem);
  });
}

const modifiers = {
  SYNTHETIC: "#monitors/webcheckdetail;webcheckId",
  HOST: "#hostdetails;id",
  APPLICATION: "#uemappmetrics;uemapplicationId",
  MOBILE_APPLICATION: "#mobileappoverview;appId",
  SERVICE: "#services/servicedetails;id",
  PROCESS: "#processdetails;id",
  PROCESS_GROUP_INSTANCE: "#processdetails;id",
  PROCESS_GROUP: "#processgroupdetails;id",
  HYPERVISOR: "#hypervisordetails;id",
  SYNTHETIC_TEST: "#webcheckdetailV3;webcheckId",
  DCRUM_APPLICATION: "#entity;id",
};

function eventLink(tenant, event, pid) {
  const entityType = event.entityId.split("-")[0];
  const modifier = modifiers[entityType];

  if (!modifier) {
    console.log(entityType);
    return `${tenant}/#problems/problemdetails;pid=${pid}`;
  }

  return `${tenant}/${modifier}=${event.entityId};gtf=p_${pid};pid=${pid}`;
}

module.exports = {
  eventLink,
  getTenant,
  getPid,
  getProblemDetails,
  addProblemComment,
  getJiraTicketLink,
  getProblemDetailsWithComments,
};