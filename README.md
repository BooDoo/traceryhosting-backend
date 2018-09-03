These instructions assume you've already set up the front end side of this: if not, get you to [traceryhosting-frontend](https://github.com/BooDoo/traceryhosting-frontend) and at least read the README there.

Back? Okay.

- install node & mysql
- clone this repo
- run `npm update` to fetch dependencies
- make a copy of `.env.example` as `.env`. fill it out! this should track `credentials.php` from the front end pretty closely. the one exception is the database user - for the backend this is `tracery_node`, not `tracery_php`. so make sure you have the passwords right and both users set up (see [dbconfig](https://github.com/BooDoo/traceryhosting-frontend/blob/master/dbconfig) from the frontend repo).


CBTS itself runs on a series of cron entries, calling `run_bots_wrapper.sh` with an argument specifying the frequency it's running at. you can manually test by running `run_bots_wrapper.sh 10` from the command line (assume you have examples with a frequency of every ten minutes in your db)

Canonical CBTS crontabs are (for now):

```
4,14,24,34,44,54 * * * * $CBTS_BACKEND/run_bots_wrapper.sh 10
2,32 * * * *    	 $CBTS_BACKEND/run_bots_wrapper.sh 30
20 * * * *      	 $CBTS_BACKEND/run_bots_wrapper.sh 60
35 */3 * * *    	 $CBTS_BACKEND/run_bots_wrapper.sh 180
50 */6 * * *    	 $CBTS_BACKEND/run_bots_wrapper.sh 360
16 4,16 * * *   	 $CBTS_BACKEND/run_bots_wrapper.sh 720
25 11 * * *     	 $CBTS_BACKEND/run_bots_wrapper.sh 1440
42 7 * * 3      	 $CBTS_BACKEND/run_bots_wrapper.sh 10080
14 3 20 * *     	 $CBTS_BACKEND/run_bots_wrapper.sh 43829
8 2 19 6 *      	 $CBTS_BACKEND/run_bots_wrapper.sh 525949
*/5 * * * *     	 $CBTS_BACKEND/run_bots_wrapper.sh rep
```

These are in UTC.


# TODO:
  - [X] Target Mastodon instance
  - [X] Change media from Buffers to ReadStreams (v1) to be compatible with [mastodon-api](https://github.com/vanita5/mastodon-api)
  - [X] Strip out twitter error code checking
  - [X] Support `{cut …}` format for CW on status
  - [X] Support `{alt …}` format for media descriptions
  - [ ] Genericize some copypasta?
  - [ ] write tests. I know, *I know*, but you really need to.
