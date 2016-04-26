# LukkariApi

## Requirements

Install MongoDB
```
$ brew update
$ brew install mongodb
```

Install npm packages
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

**/course/:coursecode**

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
