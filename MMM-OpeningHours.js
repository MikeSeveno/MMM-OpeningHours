/*
 * Notifications:
 *      PLACES_UPDATE: Received when places opening hours gets fetch/refetch.
 *      SERVICE_FAILURE: Received when the service access failed.
 */
Module.register('MMM-OpeningHours', {
  // Module defaults
  defaults: {
    googleApiKey: undefined,
    places: [],
    scheduleTime: 60000 * 60 * 24,
    timeFormat: config.timeFormat,
    language: config.language,
    styling: {
      showTimeUntil: true,
      textAlign: 'center',
      size: 'small'
    },
    debug: true,
    mockData: false
  },

  getTranslations () {
    switch (this.config.language) {
      case 'en':
        return { en: 'translations/en.json' }
      case 'sv':
        return { sv: 'translations/sv.json' }
      case 'es':
        return { es: 'translations/es.json' }
      default:
        return { en: 'translations/en.json' }
    }
  },
  // Required scripts
  getScripts: function () {
    return ['moment.js']
  },

  getStyles: function () {
    return []
  },

  // Start the module
  start: function () {
    Log.log('Starting module: ' + this.name)
    this.config.styling = { ...this.defaults.styling, ...this.config.styling }
    this.debugLog('Default config: ', this.defaults)
    this.debugLog('Config: ', this.config)
    this.loaded = false
    moment.locale(config.language)
    if (this.config.googleApiKey === undefined || this.config.googleApiKey === '') {
      this.failure = this.translate('NO_API_KEY_PROVIDED')
      this.loaded = true
    } else if (this.config.places.length === 0) {
      this.failure = this.translate('NO_PLACES_PROVIDED')
      this.loaded = true
    } else {
      this.sendSocketNotification('SETUP', this.config) // Send config to helper and initiate an update
    }

    // Schedule update interval for ui.
    var self = this
    setInterval(function () {
      self.updateDom()
    }, 1000 * 60) // 1min
  },

  getHeader: function () {
    return this.data.header
  },

  isAlwaysOpen: function (place) {
    // See note in docs. opening_hours -> periods -> close: https://developers.google.com/places/web-service/details#PlaceDetailsResults
    const firstPeriod = place.opening_hours.periods[0]
    return firstPeriod.open.day === 0 && firstPeriod.open.time === '0000' && firstPeriod.close === undefined
  },

  parse_opening_hours: function (periods) {
    /* Results in following structure
    { 0: {close: moment(), open: moment()}
      1: {close: moment(), open: moment()}
      2: {close: moment(), open: moment()} }
    */
    let res = {}
    periods.forEach(period => {
      let p = {}
      p.close = moment(period.close.time, 'HHmm').weekday(period.close.day).local(true)
      p.open = moment(period.open.time, 'HHmm').weekday(period.open.day).local(true)
      res[period.open.day] = p
    })
    this.debugLog('Periods parsed: ', JSON.stringify(res))
    return res
  },

  getDom: function () {
    var wrapper = document.createElement('div')
    wrapper.style = 'width: -moz-fit-content;'
    let container = document.createElement('div')
    container.style = 'text-align: ' + this.config.styling.textAlign + ';'

    // Loading
    if (!this.loaded) {
      container.innerHTML = this.translate('LOADING_MODULE')
      container.className = 'dimmed light small'
      wrapper.appendChild(container)
      return wrapper
    }

    // Failure
    if (this.failure !== undefined) {
      container.innerHTML = this.failure
      container.className = 'dimmed light small'
      wrapper.appendChild(container)
      return wrapper
    }

    let table = document.createElement('table')
    table.className = 'normal'
    this.placesOpeningHours.forEach(place => {
      this.debugLog('Place name: ', place.name)
      this.debugLog('Place id: ', place.place_id)
      let row = table.insertRow()
      // Name
      let nameCell = row.insertCell()
      nameCell.innerHTML = place.name
      nameCell.className = 'bright'
      // Opening hours

      let openCell = row.insertCell()
      openCell.style = 'padding-left: 8px;'
      if (place.opening_hours !== undefined) {
        if (!this.isAlwaysOpen(place)) {
          let openCellTable = document.createElement('table')
          const currentTime = moment() // this.config.mockData ? moment('21:00', 'HH:mm') : moment()
          this.debugLog('Moment now: ', currentTime.format('HH:mm'))

          const opening_hours = this.parse_opening_hours(place.opening_hours.periods)
          // Is yesterdays opening hours still in place. (Open over midnight).
          const openingHoursYesterday = opening_hours[moment().weekday() - 1]
          let closingTime = undefined
          let openingTime = undefined
          let placeIsOpen = false
          // Closed yesterday?
          if (openingHoursYesterday !== undefined) {
            // Yesterday time still valid?
            closingTime = openingHoursYesterday.close
            openingTime = openingHoursYesterday.open
            placeIsOpen = currentTime.isBetween(openingTime, closingTime)
          }

          if (placeIsOpen === false) {
            let openingHoursToday = opening_hours[moment().weekday()]
            closingTime = openingHoursToday.close
            openingTime = openingHoursToday.open
            placeIsOpen = currentTime.isBetween(openingTime, closingTime)
          }

          // Text
          let openTextCell = openCellTable.insertRow()
          openTextCell.innerHTML = placeIsOpen ? this.translate('OPEN') : this.translate('CLOSED')
          openTextCell.className = 'xsmall'
          openTextCell.style = placeIsOpen ? 'color: green;' : 'color: red;'

          // Hours
          let openingHoursCell = openCellTable.insertRow()
          openingHoursCell.className = 'xsmall'
          // Show time until closing/opening
          if (this.config.styling.showTimeUntil) {
            if (placeIsOpen) {
              let timeUntilClosing = moment.duration(closingTime.diff(currentTime)).humanize()
              openingHoursCell.innerHTML = this.translate('CLOSES_IN', { 'timeUntilClosing': timeUntilClosing })
            } else {
              let timeUntilOpen = moment.duration(currentTime.diff(openingTime)).humanize()
              openingHoursCell.innerHTML = this.translate('OPENS_IN', { 'timeUntilOpen': timeUntilOpen })

            }
            // Show only time when closing/opening
          } else {
            if (placeIsOpen) {
              openingHoursCell.innerHTML = this.translate('CLOSES') + ' ' + closingTime.format('HH:mm')
            } else {
              openingHoursCell.innerHTML = this.translate('OPENS') + ' ' + openingTime.format('HH:mm')
            }
          }

          openCell.appendChild(openCellTable)
        } else {
          openCell.innerHTML = this.translate('ALWAYS_OPEN')
        }
      } else {
        openCell.innerHTML = this.translate('NOT_AVAILABLE')
      }
    })
    container.appendChild(table)
    container.className = this.config.styling.size

    wrapper.appendChild(container)
    return wrapper
  },

  socketNotificationReceived: function (notification, payload) {
    this.debugLog('Notification - ', notification)
    if (notification === 'PLACES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      this.placesOpeningHours = payload
      this.updateDom()
    }
    if (notification === 'SERVICE_FAILURE') {
      this.failure = payload
      this.loaded = true
      Log.log('Service failure: ', this.failure)
      this.updateDom()
    }
  },

  debugLog: function (msg, object) {
    if (this.config.debug) {
      Log.log(
        '[' +
        new Date(Date.now()).toLocaleTimeString() +
        '] - DEBUG - ' +
        this.name +
        ' - ' +
        new Error().lineNumber +
        ' - : ' +
        msg, object
      )
    }
  }
})
