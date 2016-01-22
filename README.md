# LukkariApp - Server

## Requirements

Install npm packages
```
$ npm install
```

Install selenium
```
$ npm install selenium-standalone@latest -g
$ selenium-standalone install
```

Install PhantomJS
```
$ npm install -g phantomjs
```
=> needs to be installed globally so that Selenium finds it automatically ([tutorial](http://code.tutsplus.com/tutorials/headless-functional-testing-with-selenium-and-phantomjs--net-30545))

Phantomjs is a headless browser which is used to scrape the web.

Start selenium server
```
$ selenium-standalone start
```

Start node/express server
Start selenium server
```
$ node app.js
```

Shutting down Selenium *Ctrl+c* or
```
$ pkill -f selenium-standalone
```

## REST API

Course/lecture information can be queried from
```
http://localhost:8081/a/course/<course-identifier>
```
=> try for example: MS-A0107, ME-E4300, ME-E4400

**Note:** courses with loads of exercise groups will take quite a while to loads because the location information is hidden behind a link (selenium needs to visit all the location links).

=> However if same location is found multiple times it's link is only visited once which speeds up the process a bit.
