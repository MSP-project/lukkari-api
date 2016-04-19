/* eslint-disable no-use-before-define */

// import { Promise } from 'bluebird';

// const _ = require('lodash');
import moment from 'moment';
import webdriverio from 'webdriverio';
import weekdaysMapper from '../weekdays';
import errorTypes from '../errorTypes';
import { locationMapper } from '../locations';
import Boom from 'boom';
import _ from 'lodash';

require('es6-promise').polyfill();
require('isomorphic-fetch');

const cheerio = require('cheerio');

/* eslint-disable max-len */
const oodiSearchUrl = 'http://oodi.aalto.fi/a/opintjakstied.jsp?html=1&Kieli=6&Tunniste=';
/* eslint-enable max-len */

const options = { desiredCapabilities: { browserName: 'phantomjs' } };

// Exposed methods
module.exports.getCourse = getCourse;
module.exports.getCourseNew = getCourseNew;


async function getCourseNew(courseCode) {
  const data = {};
  const pageData = await fetch(`${oodiSearchUrl}${courseCode}`);
  const html = await pageData.text();

  // Load html to cheerio fro scraping
  let $ = cheerio.load(html, {
    lowerCaseTags: true,
    normalizeWhitespace: true,
  });

  if (html.indexOf('No teaching') !== -1) {
    console.log('No current/future teaching');
    throw Boom.notFound(errorTypes.ERROR_COURSE_HAS_NO_TEACHING);
  }

  try {
    const tableTitles = $('.tauluotsikko').map((i, el) => $(el).text()).get();

    // first title is eg. ME-E4300 Semantic Web, 5 cr
    const courseData = _parseCourseName(tableTitles[0]);

    // eg. 13.01.16 -07.04.16
    const fullDateRangeRgx = /^\d{2}\.\d{2}\.\d{2}\s-\d{2}\.\d{2}\.\d{2}$/;
    let durationCandidates = $('td[width="280"].tyyli0')
      .map((i, el) => $(el).text().trim()).get();

    // If only a single candidate is found, make it a list too
    if (typeof durationCandidates === 'string') {
      durationCandidates = [ durationCandidates ];
    }

    const courseDurationList = durationCandidates
      .filter((candidate) => !!candidate.match(fullDateRangeRgx))
      .map((duration) => {
        const parts = duration.split('-');
        const start = moment.utc(parts[0].trim(), 'DD.MM.YY').toISOString();
        const end = moment.utc(parts[1].trim(), 'DD.MM.YY').toISOString();

        return { start, end };
      });

    const courseDuration = courseDurationList[0];

    // Add course info to data
    data.course = { ...courseData, ...courseDuration };
  } catch (e) {
    console.log('COURSE NOT FOUND', e);
    throw Boom.notFound(errorTypes.ERROR_COURSE_NOT_FOUND);
  }

  /*
   * 2) Open course's detail oodi page and scrape the events data
   */

  // Find
  console.log('LLLLLLLL', data.course);
  const eventLink = $(`td.tyyli0 > a[href*='${courseCode}']`).filter(
    (i, el) => {
      console.log('=========');
      console.log($(el).text());
      console.log(data.course.name);
      console.log('=========');
      return $(el).text().trim() === data.course.name;
    }
  ).first().attr('href');

  const nextPageLink = `http://oodi.aalto.fi${eventLink}`;

  const mainPageData = await fetch(`${nextPageLink}`);
  const mainHtml = await mainPageData.text();

  // Load new html to cheerio fro scraping
  $ = cheerio.load(mainHtml, {
    lowerCaseTags: true,
    normalizeWhitespace: false,
  });

  // let eventsData;
  try {
    const pattern = `Lecture|Exercises|Midtermexam|${data.course.name}`;
    const re = new RegExp(pattern);

    const scraped = $(`table[width='100%'][border='0']`)
      .map((i, el) => $(el).text().trim())
      .filter((i, el) => re.test(el))
      .filter((i, el) => el.indexOf('Teaching event') === -1)
      .get();

    const uniqScraped = _.uniq(scraped);
    console.log('**********');
    console.log(uniqScraped);
    console.log('**********');

    const eventsData = [];

    let isLecture = false;
    let isExercise = false;
    let isMidterm = false;

    uniqScraped.forEach((e) => {
      if (e.indexOf('Lecture') !== -1) {
        isLecture = true;
        isExercise = false;
        isMidterm = false;
        return;
      }
      if (e.indexOf('Exercises') !== -1) {
        isLecture = false;
        isExercise = true;
        isMidterm = false;
        return;
      }
      if (e.indexOf('Midtermexam') !== -1) {
        isLecture = false;
        isExercise = false;
        isMidterm = true;
        return;
      }

      const pure = e.replace(/ /g, '').replace(/(\n)+/g, '#');

      if (isLecture) eventsData.push({ type: 'lecture', data: pure });
      if (isExercise) eventsData.push({ type: 'exercise', data: pure });
      if (isMidterm) eventsData.push({ type: 'midtermexam', data: pure });
    });

    let locationsData =
      $(`td[width='36%'] input.submit2[name*='LINKOPETPAIK_']`)
      .map((i, el) => $(el).val()).get();

    if (!eventsData) {
      console.log('COURSE EVENTS NOT FOUND');
      throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_NOT_FOUND);
    }

    if (!locationsData) {
      console.log('COURSE EVENTS LOCATIONS NOT FOUND');
      throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_LOCATION_NOT_FOUND);
    }

    locationsData = Array.isArray(locationsData)
      ? locationsData
      : [locationsData];

    const separator = '#';
    const courseEventsLists = eventsData.map((e) => _parseCourseEventsNew(
      e, locationsData, separator
    ));

    const courseEvents = _.flatten(courseEventsLists);

    if (!courseEvents) {
      console.log('UNABLE TO PARSE COURSE EVENTS/LOCATIONS');
      throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_NOT_PARSED);
    }

    // Add courses events info to data
    data.events = courseEvents;

    return data;
  } catch (e) {
    console.log(e);
    throw Boom.notFound(errorTypes.ERROR_COURSE_HAS_NO_TEACHING);
  }
}


async function getCourse(courseCode) {
  const client = webdriverio.remote(options);
  const url = oodiSearchUrl + courseCode;
  const data = {};

  /*
   * 1) Open course's oodi page and scrape the table titles
   */
  try {
    const tableTitles = await client.init().url(url).getText('.tauluotsikko');
    // first title is eg. ME-E4300 Semantic Web, 5 cr
    const courseData = _parseCourseName(tableTitles[0]);

    // eg. 13.01.16 -07.04.16
    const fullDateRangeRgx = /^\d{2}\.\d{2}\.\d{2}\s-\d{2}\.\d{2}\.\d{2}$/;
    let durationCandidates = await client.getText('td[width="280"].tyyli0');

    // If only a single candidate is found, make it a list too
    if (typeof durationCandidates === 'string') {
      durationCandidates = [ durationCandidates ];
    }

    const courseDurationList = durationCandidates
      .filter((candidate) => !!candidate.match(fullDateRangeRgx))
      .map((duration) => {
        const parts = duration.split('-');
        const start = moment.utc(parts[0].trim(), 'DD.MM.YY').toISOString();
        const end = moment.utc(parts[1].trim(), 'DD.MM.YY').toISOString();

        return { start, end };
      });

    const courseDuration = courseDurationList[0];

    // Add course info to data
    data.course = { ...courseData, ...courseDuration };
  } catch (e) {
    console.log('COURSE NOT FOUND', e);
    throw Boom.notFound(errorTypes.ERROR_COURSE_NOT_FOUND);
  }

  /*
   * 2) Open course's detail oodi page and scrape the events data
   */
  const nextPageLink = '*=' + data.course.name;

  let eventsData;
  try {
    eventsData = await client.click(nextPageLink).getText('table.kll');
  } catch (e) {
    console.log('No current/future teaching');
    throw Boom.notFound(errorTypes.ERROR_COURSE_HAS_NO_TEACHING);
  }

  let locationsData = await client.getValue('td[width="36%"] input.submit2');

  /*
   * NOTE: if event does not have a location specified => it is impossible to
   * attach the location info correctly to an event since eventsData and
   * locationsData need to have same length (indexes match)
   */

  if (!eventsData) {
    console.log('COURSE EVENTS NOT FOUND');
    throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_NOT_FOUND);
  }

  if (!locationsData) {
    console.log('COURSE EVENTS LOCATIONS NOT FOUND');
    throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_LOCATION_NOT_FOUND);
  }

  // Events and locations data needs to be an array for the parser
  eventsData = Array.isArray(eventsData)
    ? eventsData
    : [eventsData];

  locationsData = Array.isArray(locationsData)
    ? locationsData
    : [locationsData];


  const separator = '\n';
  const courseEvents = _parseCourseEvents(eventsData, locationsData, separator);

  if (!courseEvents) {
    console.log('UNABLE TO PARSE COURSE EVENTS/LOCATIONS');
    throw Boom.notFound(errorTypes.ERROR_COURSE_EVENTS_NOT_PARSED);
  }

  // Add courses events info to data
  data.events = courseEvents;

  return data;
}


/* ***** Own methods ************************ */
function _parseCourseName(courseInfo) {
  const parts = courseInfo.split(',');

  if (parts.length === 1) return null;

  const foo = parts.shift().replace(/\s/g, '#').split('#');
  const credits = parts.pop().replace(/\s/g, '');
  const code = foo.shift().replace(/\s/g, '');

  let name;
  if (parts.length > 3) {
    name = `${foo.join(' ')},${parts.join(',')}`;
  } else {
    name = `${foo.join(' ')}`;
  }

  return { code, name, credits };
}


function _createSubEvents(ddmmyyStart, ddmmyyEnd) {
  const subEvents = [];
  const start = moment(ddmmyyStart, 'DDMMYY');
  const end = moment(ddmmyyEnd, 'DDMMYY');

  while (start.isBefore(end)) {
    subEvents.push({ id: null, date: start.format('MM-DD-YYYY') });
    start.add(7, 'days');
  }
  subEvents.push({ id: null, date: end.format('MM-DD-YYYY') });
  return subEvents;
}


function _parseCourseEventsNew(eventSection, locationList, separator) {
  console.log(eventSection);
  const courseEvents = [];

  const splittedData = eventSection.data.split(separator);
  console.log(splittedData);

  const dateRangeRgx = /^\d{2}\.\d{2}\.-\d{2}\.\d{2}\.\d{2}$/;
  const dateSingleRgx = /^\d{2}\.\d{2}\.\d{2}(?! klo)$/;
  /* eslint-disable max-len*/
  // eg. tue 12.15-14.00
  const timeRgx = /^(?:mon|tue|wed|thu|fri|sat|sun)\s\d{2}\.\d{2}-\d{2}\.\d{2}$/;
  /* eslint-enable max-len*/

  splittedData.forEach((dataPiece, idx) => {
    let isEvent = true;

    // Init new event
    const courseEvent = { type: eventSection.type };

    /*
     * Test if event has single or ranged date
     * => eg. "07.01.-11.02.16" or "11.02.16"
     */
    courseEvent.subEvents = [];
    if (!!dataPiece.trim().match(dateRangeRgx)) {
      const parts = dataPiece.split('-');
      const ddmmyyEnd = parts[1];
      const ddmmyyStartParts = parts[0].split('.');
      const ddmmyyEndParts = parts[1].split('.');

      const ddmmyyStart = !!ddmmyyStartParts[2]
        ? ddmmyyStartParts.join('.')
        : ddmmyyStartParts.join('.') + ddmmyyEndParts[2];

      const subEvents = _createSubEvents(ddmmyyStart, ddmmyyEnd);
      courseEvent.subEvents = subEvents;
    } else if (!!dataPiece.trim().match(dateSingleRgx)) {
      courseEvent.subEvents.push(
        { date: dataPiece }
      );
      // courseEvent.startDate = dataPiece;
      // courseEvent.endDate = dataPiece;
    } else {
      isEvent = false;
    }
    console.log(courseEvent);

    // Test if event has time => eg. "thu 13.15-15.00"
    if (isEvent && splittedData.length - 1 >= idx + 1) {
      if (eventSection.type === 'midtermexam') {
        courseEvent.locations = [];
        let cursor = idx + 1;
        let setTime = true;

        while (!!splittedData[cursor].trim().match(timeRgx)) {
          // All the times should be same so use just the first one
          if (setTime) {
            // TODO use moment instead
            const day = weekdaysMapper[
              splittedData[cursor].trim().slice(0, 3)
            ];
            const parts = splittedData[cursor].trim().slice(4).split('-');

            courseEvent.day = day;
            courseEvent.startTime = parts[0].replace('.', ':');
            courseEvent.endTime = parts[1].replace('.', ':');

            setTime = false;
          }
          const abbrev = locationList.shift();
          const locationParts = abbrev.split('/');
          const locationDetails = locationMapper[locationParts[0]] || {};

          courseEvent.locations.push({
            room: locationParts[0],
            address: locationDetails.address || null,
            building: locationDetails.building || null,
            lat: locationDetails.lat || null,
            lng: locationDetails.lng || null,
            abbrev,
          });

          cursor += 1;
        }
      } else {
        // The next piece contains the time info
        const nextDataPiece = splittedData[idx + 1].trim();

        if (!!nextDataPiece.match(timeRgx)) {
          const day = weekdaysMapper[
            nextDataPiece.slice(0, 3)
          ];
          const parts = nextDataPiece.slice(4).split('-');

          courseEvent.day = day;
          courseEvent.startTime = parts[0].replace('.', ':');
          courseEvent.endTime = parts[1].replace('.', ':');
        } else {
          isEvent = false;
        }
      }
    } else {
      isEvent = false;
    }

    // Add location data to event
    if (isEvent && eventSection.type !== 'midtermexam' && locationList.length) {
      courseEvent.locations = [];

      const abbrev = locationList.shift();
      const locationParts = abbrev.split('/');
      const locationDetails = locationMapper[locationParts[0]] || {};

      courseEvent.locations.push({
        room: locationParts[0],
        address: locationDetails.address || null,
        building: locationDetails.building || null,
        lat: locationDetails.lat || null,
        lng: locationDetails.lng || null,
        abbrev,
      });
    }

    if (isEvent) {
      courseEvents.push(courseEvent);
    }
  });

  return courseEvents;
}


function _parseCourseEvents(eventSections, locationList, separator) {
  const courseEvents = [];

  eventSections.forEach((eventSection) => {
    const splittedData = eventSection.split(separator);

    // eg. "midtermexam" or "exercise"
    const courseEventType = splittedData[1]
    .toLowerCase()
    .replace(/ /g, '')
    .replace(/teacher/g, '')
    .replace(/exercises/g, 'exercise');

    const dateRangeRgx = /^\d{2}\.\d{2}\.-\d{2}\.\d{2}\.\d{2}$/;
    const dateSingleRgx = /^\d{2}\.\d{2}\.\d{2}(?! klo)$/;
    /* eslint-disable max-len*/
    const timeRgx = /^(?:mon|tue|wed|thu|fri|sat|sun) \d{2}\.\d{2}-\d{2}\.\d{2}$/;
    /* eslint-enable max-len*/

    splittedData.forEach((dataPiece, idx) => {
      let isEvent = true;

      // Init new event
      const courseEvent = { type: courseEventType };

      /*
       * Test if event has single or ranged date
       * => eg. "07.01.-11.02.16" or "11.02.16"
       */

      // TODO: create subEvents!!!
      // TODO: add label for event
      courseEvent.subEvents = [];
      if (!!dataPiece.match(dateRangeRgx)) {
        const parts = dataPiece.split('-');
        const ddmmyyEnd = parts[1];
        const ddmmyyStartParts = parts[0].split('.');
        const ddmmyyEndParts = parts[1].split('.');

        const ddmmyyStart = !!ddmmyyStartParts[2]
          ? ddmmyyStartParts.join('.')
          : ddmmyyStartParts.join('.') + ddmmyyEndParts[2];

        const subEvents = _createSubEvents(ddmmyyStart, ddmmyyEnd);
        courseEvent.subEvents = subEvents;
      } else if (!!dataPiece.match(dateSingleRgx)) {
        courseEvent.subEvents.push(
          { id: null, date: dataPiece }
        );
        // courseEvent.startDate = dataPiece;
        // courseEvent.endDate = dataPiece;
      } else {
        isEvent = false;
      }

      // Test if event has time => eg. "thu 13.15-15.00"
      if (isEvent && splittedData.length - 1 >= idx + 1) {
        if (courseEventType === 'midtermexam') {
          courseEvent.locations = [];
          let cursor = idx + 1;
          let setTime = true;

          while (!!splittedData[cursor].trim().match(timeRgx)) {
            // All the times should be same so use just the first one
            if (setTime) {
              // TODO use moment instead
              const day = weekdaysMapper[
                splittedData[cursor].trim().slice(0, 3)
              ];
              const parts = splittedData[cursor].trim().slice(4).split('-');

              courseEvent.day = day;
              courseEvent.startTime = parts[0].replace('.', ':');
              courseEvent.endTime = parts[1].replace('.', ':');

              setTime = false;
            }
            const abbrev = locationList.shift();
            const locationParts = abbrev.split('/');
            const locationDetails = locationMapper[locationParts[0]] || {};

            courseEvent.locations.push({
              room: locationParts[0],
              address: locationDetails.address || null,
              building: locationDetails.building || null,
              lat: locationDetails.lat || null,
              lng: locationDetails.lng || null,
              abbrev,
            });

            cursor += 1;
          }
        } else {
          // The next piece contains the time info
          const nextDataPiece = splittedData[idx + 1].trim();

          if (!!nextDataPiece.match(timeRgx)) {
            const day = weekdaysMapper[
              nextDataPiece.slice(0, 3)
            ];
            const parts = nextDataPiece.slice(4).split('-');

            courseEvent.day = day;
            courseEvent.startTime = parts[0].replace('.', ':');
            courseEvent.endTime = parts[1].replace('.', ':');
          } else {
            isEvent = false;
          }
        }
      } else {
        isEvent = false;
      }

      // Add location data to event
      if (isEvent && courseEventType !== 'midtermexam' && locationList.length) {
        courseEvent.locations = [];

        const abbrev = locationList.shift();
        const locationParts = abbrev.split('/');
        const locationDetails = locationMapper[locationParts[0]] || {};

        courseEvent.locations.push({
          room: locationParts[0],
          address: locationDetails.address || null,
          building: locationDetails.building || null,
          lat: locationDetails.lat || null,
          lng: locationDetails.lng || null,
          abbrev,
        });
      }

      if (isEvent) {
        courseEvents.push(courseEvent);
      }
    });
  });

  return courseEvents;
}
