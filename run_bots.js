var git = require('git-rev-sync');
var Raven = require('raven');
Raven.config(process.env.SENTRY_DSN, {
	environment: process.env.ENVIRONMENT_NAME,
	release: git.long()
}).install();

var arg0 = process.argv[2];
var replies = (arg0 === "replies");
var frequency = parseInt(arg0, 10);
//obv only one of these will be true

var tracery = require('tracery-grammar');
var _ = require('underscore');

var Mastodon = require('mastodon-api');

const path = require('path');
const os = require('os');
const he = require('he');
const textVersion = require('textversionjs');

var fs = require('pn/fs');
var svg2png = require('svg2png');
var heapdump = require('heapdump');
var util = require("util");
const request = require('request');
const fetch = require('node-fetch');

_.mixin({
	guid : function(){
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
	    return v.toString(16);
	  });
	}
});


function log_line_single(message)
{
	console.log(
		new Date().toISOString(),
		"arg:" + arg0,
		"INFO",
		message
	);
}

function log_line(username, userid, message, params)
{
	if (params)
	{
		var paramString = util.inspect(params, {breakLength: Infinity, maxArrayLength:5});

		paramString = paramString.replace("\n", "\\n");
	}
	console.log(
		new Date().toISOString(),
		"arg:" + arg0,
		"INFO",
		username,
		"(" + userid + ")",
		message,
		paramString ? paramString : ""
	);
}

function log_line_single_error(message)
{
	console.log(
		new Date().toISOString(),
		"arg:" + arg0,
		"ERROR",
		message
	);
}

function log_line_error(username, userid, message, params)
{
	if (params)
	{
		var paramString = util.inspect(params, {breakLength: Infinity, maxArrayLength:5});

		paramString = paramString.replace("\n", "\\n");
	}
	console.log(
		new Date().toISOString(),
		"arg:" + arg0,
		"ERROR",
		username,
		"(" + userid + ")",
		message,
		paramString ? paramString : ""
	);
}

async function generate_svg(svg_text, M)
{
	let TMP_PATH = path.join(os.tmpdir(), `cbts${_.guid()}.png`);
	let data = await svg2png(Buffer.from(svg_text));
	let written = await fs.writeFile(TMP_PATH, data);
	log_line(null, null, "Wrote temp PNG @ " + TMP_PATH);
	let media_id = await uploadMedia(fs.createReadStream(TMP_PATH), M);
	return media_id;
}

async function fetch_img(url, M)
{
	log_line(null, null, "passing " + url + " to request");
	let media_id = await uploadMedia(request(url), M); //doesn't allow gifs/movies
	return media_id;
}

async function uploadMediaChunked(buffer, mimeType, M)
{
	//todo see https://github.com/ttezel/twit/blob/master/tests/rest_chunked_upload.js#L20
	//get mimeType with https://www.npmjs.com/package/file-type

}

async function uploadMedia(readStream, M)
{
	var {data, resp} = await M.post('/media', { file: readStream });


	if (data.errors)
	{
		if (data.errors === undefined) // placeholder
		{
			throw (new Error ("This should never happen. Find a priest."));
		}
	}
	if (!resp || resp.statusCode != 200)
	{
		if (resp.statusCode == 401)
		{
			log_line_error(null, null, "Can't upload media, Not authorized", data);
			throw (new Error ("Can't upload media, Not authorized"));
		}
		if (resp.statusCode == 403)
		{
			log_line_error(null, null, "Can't upload media, Forbidden", data);
			throw (new Error ("Can't upload media, Forbidden"));
		}
		if (resp.statusCode == 400)
		{
			log_line_error(null, null, "Can't upload media, Bad Request", data);
			throw (new Error ("Can't upload media, 400 Bad Request"));
		}
		else
		{
			var err = new Error("Couldn't upload media, got response status " + resp.statusCode + " (" + resp.statusMessage + ")");
			Raven.captureException(err,
				{
					extra:
					{
						response : resp,
						data : data
					}
				});

			log_line_error(null, null, err, data);
			throw (err);
		}
	}
	if (data.type == 'unknown') {
		log_line_error(null,null, "Couldn't upload media, Bad Stream(?)", data);
		throw (new Error (`Couldn't upload media, Bad Stream(?) - type '${data.type}'`));
	}
	log_line(null, null, "uploaded media", data);
	return data.id;
}

// this is much more complex than i thought it would be
// but this function will find our image tags 
// full credit to BooDooPerson - https://twitter.com/BooDooPerson/status/683450163608817664
// Reverse the string, check with our fucked up regex, return null or reverse matches back
var matchBrackets = function(text) {
  
  // simple utility function
  function reverseString(s) {
    return s.split('').reverse().join('');
  }

  // this is an inverstion of the natural order for this RegEx:
  var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

  text = reverseString(text);
  var matches = text.match(bracketsRe);
  if(matches === null) {
    return null;
  }
  else {
    return matches.map(reverseString).reverse();
  }
}


//see matchBrackets for why this is like this
function removeBrackets (text) {
  
  // simple utility function
  var reverseString = function(s) {
    return s.split('').reverse().join('');
  }

  // this is an inverstion of the natural order for this RegEx:
  var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

  text = reverseString(text);
  return reverseString(text.replace(bracketsRe, ""));
}


function render_media_tag(match, M)
{
	var unescapeOpenBracket = /\\{/g;
	var unescapeCloseBracket = /\\}/g;
	match = match.replace(unescapeOpenBracket, "{");
	match = match.replace(unescapeCloseBracket, "}");

	if (match.indexOf("svg ") === 1)
	{
		return generate_svg(match.substr(5,match.length - 6), M);
	}
	else if (match.indexOf("img ") === 1)
	{
		return fetch_img(match.substr(5, match.length - 6), M);
	}
	else
	{
		throw(new Error("error {" + match.substr(1,4) + "... not recognized"));
	}
}

async function recurse_retry(origin, tries_remaining, processedGrammar, M, result, in_reply_to)
{
	if (tries_remaining <= 0)
	{
		return;
	}

	try
	{
		var status = processedGrammar.flatten(origin);
		var status_without_image = removeBrackets(status);
		var media_tags = matchBrackets(status);

		let params = {};

		if (typeof in_reply_to === 'undefined')
		{
			params = { status: status_without_image};
		}
		else
		{
			var username = in_reply_to["account"]["acct"];
			params = {status: "@" + username + " " + status_without_image, in_reply_to_id:in_reply_to["status"]["id"]}
		}

		if (media_tags)
		{
			params['sensitive'] = result['is_sensitive'];
			let start_time_for_processing_tags = process.hrtime();
			try 
			{
				var media_promises = media_tags.map(tag => render_media_tag(tag, M));
				var medias = await Promise.all(media_promises);
				params.media_ids = medias;
			}
			catch (err)
			{
				log_line_error(result["username"], result["url"], "failed rendering and uploading media", err);
				recurse_retry(origin, tries_remaining - 1, processedGrammar, M, result, in_reply_to);
				return;
			}
			let processing_time = process.hrtime(start_time_for_processing_tags);
			if (processing_time[0] > 5) {
				log_line(result["username"], result["url"], `processing media tags took ${processing_time[0]}:${processing_time[1]}`);
			}
			if (processing_time[0] > 30) {
				Raven.captureMessage("Processing media tags took over 30 secs", 
				{
					user: 
					{
						username: result['username'],
						id : result['url']
					},
					extra:
					{
						processing_time: processing_time,
						media_tags : media_tags,
						status : status,
						params : params,
						tries_remaining: tries_remaining,
						mention: in_reply_to,
						tracery: result['tracery'],
						response : resp,
						data : data
					}
				});
					
			}
		}
		log_line(result["username"], result["url"], "posting", params);

		try
		{
			var {data, resp} = await M.post('/statuses', params);

			if (!resp || resp.statusCode != 200)
			{
				if (data.errors){var err = data.errors[0];}
				else { 
					log_line(result["username"], result["url"], "no explicit error given (maybe HTTP 431)", params);
					return;
				}

				if (err["code"] == 666) // too evil (placeholder)
				{
					recurse_retry(origin, tries_remaining - 1, processedGrammar, M, result, in_reply_to);
				}
				else
				{
					log_line_error(result["username"], result["url"], `failed to post for a more mysterious reason (${JSON.stringify(err,null,2)})`, params);
					Raven.captureMessage(`Failed to post, Mastodon gave err ${JSON.stringify(err,null,2)}`, 
					{
						user: 
						{
							username: result['username'],
							id : result['url']
						},
						extra:
						{
							params : params,
							tries_remaining: tries_remaining,
							mention: in_reply_to,
							tracery: result['tracery'],
							response : resp,
							data : data
						}
					});
				}
			}
		}
		catch (err)
		{
			log_line_error(result["username"], result["url"], "failed to post " + util.inspect(params), err);
			Raven.captureException(err, 
			{
				user: 
				{
					username: result['username'],
					id : result['url']
				},
				extra:
				{
					params : params,
					tries_remaining: tries_remaining,
					mention: in_reply_to,
					tracery: result['tracery'],
					response : resp,
					data : data
				}
			});
			throw (err);
		}
				
	}
	catch (e)
	{
		log_line_error(result["username"], result["url"], "failed to post ", err);
		Raven.captureException(e, 
		{
			user: 
			{
				username: result['username'],
				id : result['url']
			},
			extra:
			{
				tries_remaining: tries_remaining,
				mention: in_reply_to,
				tracery: result['tracery']
			}
		});
		recurse_retry(origin, tries_remaining - 1, processedGrammar, M, result, in_reply_to);
	}
	

};
	


async function post_for_account(connectionPool, url)
{
	let [tracery_result, fields] = await connectionPool.query('SELECT bearer, instance, username, url, is_sensitive, tracery from `traceries` where url = ?', [url]);


	var processedGrammar = tracery.createGrammar(JSON.parse(tracery_result[0]['tracery']));
	processedGrammar.addModifiers(tracery.baseEngModifiers); 
	
	var M = new Mastodon(
	{
		api_url:		"https://" + tracery_result[0]['instance'] + "/api/v1"
		, access_token:		tracery_result[0]['bearer']
	}
	);

	try
	{
		await recurse_retry("#origin#", 5, processedGrammar, M, tracery_result[0]);
	}
	catch (e)
	{
		log_line_error(tracery_result[0]['username'], url, "failed to post ", e);
		Raven.captureException(e, 
		{
			user: 
			{
				username:	tracery_result[0]['username'],
				id:		url
			},
			extra:
			{
				tracery:	tracery_result[0]['tracery']
			}
		});
	}
}

async function reply_for_account(connectionPool, url)
{
	
	if (Math.random() < 0.05)
	{
		log_line(null, url, "skipping checking replies due to chance");
		return;
	}

	var [tracery_result, fields] = await connectionPool.query('SELECT bearer, instance, username, url, is_sensitive, tracery, last_reply, reply_rules from `traceries` where url = ?', [url]);
	

	var M = new Mastodon(
	{
		api_url:		"https://" + tracery_result[0]['instance'] + "/api/v1"
		, access_token:		tracery_result[0]['bearer']
	}
	);

	try
	{
		var processedGrammar = tracery.createGrammar(JSON.parse(tracery_result[0]["tracery"]));
		processedGrammar.addModifiers(tracery.baseEngModifiers); 
	}
	catch (e)
	{
		log_line_error(tracery_result[0]['username'], url, "failed to parse tracery for reply ", e);
		Raven.captureException(e, 
		{
			user: 
			{
				username: tracery_result[0]['username'],
				id : url
			},
			extra:
			{
				tracery: tracery_result[0]['tracery'],
				reply_rules : tracery_result[0]["reply_rules"],
				last_reply : tracery_result[0]["last_reply"]
			}
		});
	}

	try
	{
		var reply_rules = JSON.parse(tracery_result[0]["reply_rules"]);
	}
	catch(e)
	{
		log_line_error(tracery_result[0]['username'], url, "failed to parse reply_rules ", e);
		Raven.captureException(e, 
		{
			user: 
			{
				username: tracery_result[0]['username'],
				id : url
			},
			extra:
			{
				tracery: tracery_result[0]['tracery'],
				reply_rules : tracery_result[0]["reply_rules"],
				last_reply : tracery_result[0]["last_reply"]
			}
		});
	}


	var last_reply = tracery_result[0]['last_reply'];
	var count = 50;
	if (last_reply == null)
	{
		log_line(tracery_result[0]["username"], tracery_result[0]["url"], " last reply null, setting to 1 ");
		last_reply = "1";
		count = 1;
	}

	var {resp, data} = await M.get('/notifications', {count:count, since_id:last_reply, exclude_types: ["follow", "favourite", "reblog"]});

	if (!resp || resp.statusCode != 200)
	{
		log_line(tracery_result[0]["username"], tracery_result[0]["url"], " can't fetch mentions, statusCode: " + resp.statusCode + " message:" + resp.statusMessage + " data:", data);
	}
		
	if (data.length > 0)
	{
		try
		{
			let [results, fields] = await connectionPool.query("UPDATE `traceries` SET `last_reply` = ? WHERE `url` = ?", 
															   [data[0]['id'], tracery_result[0]["url"]]);
		

			log_line(tracery_result[0]["username"], tracery_result[0]["url"], " set last_reply to " + data[0]['id']);
		}
		catch (e)
		{
			log_line_error(tracery_result[0]['username'], url, "failed to update db for last_reply to " + data[0]['id'], e);
			Raven.captureException(e, 
			{
				user: 
				{
					username: tracery_result[0]['username'],
					id : url
				},
				extra:
				{
					tracery: tracery_result[0]['tracery'],
					reply_rules : tracery_result[0]["reply_rules"],
					last_reply : tracery_result[0]["last_reply"]
				}
			});
			return;
		}

		//now we process the replies
		for (const mention of data) {
			let mentionText = he.decode(textVersion(mention.status["content"])).trim();

			try
			{
				log_line(tracery_result[0]["username"], tracery_result[0]["url"], " replying to ", mentionText);
	
				var origin = _.find(reply_rules, function(origin,rule) {return new RegExp(rule).test(mentionText);});
				if (typeof origin != "undefined")
				{
					await recurse_retry(origin, 5, processedGrammar, M, tracery_result[0], mention);
				}

			}
			catch (e)
			{
				log_line_error(tracery_result[0]['username'], url, "failed to reply ", e);
				Raven.captureException(e, 
				{
					user: 
					{
						username: tracery_result[0]['username'],
						id : url
					},
					extra:
					{
						tracery: tracery_result[0]['tracery'],
						mention: mention
					}
				});
			}
		}
	}

	
}


async function run()
{
	log_line_single("starting");
	const mysql      = require('mysql2/promise');
	try
	{
		var connectionPool = await mysql.createPool({
			connectionLimit : 10,
			host     : 'localhost',
			user     : 'tracery_node',
			password : process.env.TRACERY_NODE_DB_PASSWORD,
			database : 'traceryhosting',
			charset : "utf8mb4"
		});
	}
	catch(e)
	{
		throw(e);
		return;
	}	

	if (!replies && !isNaN(frequency))
	{
		var [results, fields] = await connectionPool.query('SELECT url FROM `traceries` WHERE `frequency` = ? AND IFNULL(`blocked_status`, 0) = 0', [frequency]);
		

		if (typeof results === 'undefined')
		{
			log_line_single_error("database connection error");
			throw(new Error("Database connection error"));
		}

		for (const result of results) {
			try
			{
				await post_for_account(connectionPool, result['url']);
			}
			catch (e)
			{
				log_line_single_error("failed to post for " + result['ur;']);
				Raven.captureException(e, { user: { id : result['url'] } });
			}
		}

	}
	else if (replies)
	{

		try 
		{
			var [results, fields] = await connectionPool.query('SELECT url FROM `traceries` WHERE `does_replies` = 1 AND IFNULL(`blocked_status`, 0) = 0');
		}
		catch(e)
		{
			log_line_single_error("failed to query db for replies");
			Raven.captureException(e);
		}


		for (const result of results) {
			try
			{
				await reply_for_account(connectionPool, result['url']);
			}
			catch (e)
			{
				log_line_single_error("failed to reply for " + result['url']);
				Raven.captureException(e, { user: { id : result['url'] } });
			}
		}

		
	}

	await connectionPool.end();
	log_line_single("closed");
}

run();


