# LukkariApi
LukkariApi is a REST API that is used in [LukkariApp](https://github.com/MSP-project/lukkari-app) for getting the information about courses from Oodi by web scraping the data.     

The API provides fairly good coverage for major part of the courses in Oodi, but since the course information is not always in a standard form (eg. lecture details in description section etc.) some courses cannot be scraped successfully.

The end goal for this API is to use some open API provided either by MyCourses or Oodi to fetch the required data. However, currently the data fetching is done via web scraping.

You can test the API locally by cloning this repo and following the next installation steps.

## Requirements

Install MongoDB
```
$ brew update
$ brew install mongodb
```

Install npm packages (nodemon for hot-reloading)
```
$ npm install nodemon -g
$ npm install
```

Start node/koa server
```
$ npm start
```

## REST API

Course/lecture information can be queried from
```
http://localhost:8082/course/<course-identifier>
```
==> try for example: `MS-A0107`, `ME-E4300`, `ME-E4400`

All endpoints:
```
POST /login
POST /register
GET /course/:coursecode
GET /user/:uid/courses
DELETE /user/:uid
POST, DELETE /user/:uid/courses/:coursecode
```

### Example data

**GET /course/:coursecode**

```json
{
  "course": {
    "code": "ICS-E4020",
    "name": "Programming Parallel Computers",
    "credits": "5cr",
    "start": "2016-04-11T00:00:00.000Z",
    "end": "2016-05-20T00:00:00.000Z"
  },
  "events": [
    {
      "type": "exercise",
      "subEvents": [
        {
          "date": "04-15-2016"
        },
        {
          "date": "04-22-2016"
        },
      ],
      "day": "Friday",
      "startTime": "16:15",
      "endTime": "18:00",
      "locations": [
        {
          "room": "R017",
          "address": "Sähkömiehentie 3",
          "building": "Maarintalo",
          "lat": 60.18926309999999,
          "lng": 24.8262549,
          "abbrev": "R017/Maari-A"
        }
      ]
    }
  ],
  "updated": 1461679298430,
  "_id": "...."
}
```


## Server

### TODO
- Resize DO instance
- Use Node.js [recluster](https://github.com/doxout/recluster)
- Improve oodi-aalto parser to better deal with anomalies in Oodi's data
- Implement oodi-hy parser for HY students ;) 
