# LukkariApp - Server

## Server

Tutorials
- https://github.com/beautifulcode/ssh-copy-id-for-OSX
- https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu-14-04
- https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-14-04

SSH to server
`$ ssh lukkari@146.185.150.48`

## How it works
*New user*
- registers to Lukkari App (basic, google, twitter etc...)
  - add new user
- starts adding courses (taps "+" button)
  - "Give course code" -> types: "ME-E4400"
  - search from db
    - if found -> add the course to the user -> update course info
    - if not found -> scrape data from Oodi -> add to courses collection -> add course to user
  - return course data?

## Endpoints

api/course/:coursecode
=> kurssin tiedot + eventit

User
- username
- password


Course
- id
- code
- name
- credits


Event
- id
- date
- type
- coursecode
- examcode
- label = coursename + eventtype
- day
- startTime
- endTime
- locations: [
  {
    - abbrev
    - room
    - address
    - building
    - lat
    - lng
  }
]

## Requirements

Install npm packages
```
$ npm install nodemon -g
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

Start node/koa server
```
$ npm start
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
