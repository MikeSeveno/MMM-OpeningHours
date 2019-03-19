/*
 * Notifications:
 *      STORES_UPDATE: Recived when STORES opening hours gets fetch/refetch.
 *      SERVICE_FAILURE: Received when the service access failed.
 */
Module.register('MMM-OpeningHours', {
  // Module defaults
  defaults: {
    googleApiKey: undefined,
    stores: [],
    scheduleTime: 60000 * 60 * 24,
    timeFormat: config.timeFormat,
    language: config.language,
    styling: {
      showTimeUntil: true,
      textAlign: 'center',
      size: 'small',
      header: {
        show: true,
        size: 'xsmall',
        textAlign: 'center',
      }
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
    const userStyleHeader = this.config.styling.header
    this.config.styling = { ...this.defaults.styling, ...this.config.styling }
    this.config.styling.header = { ...this.defaults.styling.header, ...userStyleHeader }
    this.debugLog('Default config: ', this.defaults)
    this.debugLog('Config: ', this.config)
    this.loaded = false
    moment.locale(config.language)
    if (this.config.googleApiKey === undefined || this.config.googleApiKey === "") {
      this.failure = this.translate('NO_API_KEY_PROVIDED')
      this.loaded = true
    } else if (this.config.stores.length === 0) {
      this.failure = this.translate('NO_STORES_PROVIDED')
      this.loaded = true
    } else {
      this.sendSocketNotification('SETUP', this.config) // Send config to helper and initiate an update
    }
  },

  getDom: function () {
    var wrapper = document.createElement('div')
    wrapper.style = 'width: -moz-fit-content;'
    if (this.config.styling.header.show) {
      var headerHtml = document.createElement('header')
      headerHtml.innerHTML = this.translate('HEADER')
      headerHtml.className = this.config.styling.header.size
      headerHtml.style = 'text-align: ' + this.config.styling.header.textAlign + ';'
      wrapper.appendChild(headerHtml)
    }
    let container = document.createElement('div')

    if (!this.loaded) {
      container.innerHTML = this.translate('LOADING_MODULE')
      container.className = 'dimmed light small'
    } else if (this.failure !== undefined) {
      container.innerHTML = this.failure
      container.className = 'dimmed light small'
    } else {
      let table = document.createElement('table')
      table.className = 'normal'
      this.storeOpeningHours.forEach(store => {
        let row = table.insertRow()
        // Name
        let nameCell = row.insertCell()
        nameCell.innerHTML = store.name
        nameCell.className = 'bright'
        // Opening hours
        let openCell = row.insertCell()
        openCell.style = 'padding-left: 8px;'
        let openCellTable = document.createElement('table')
        const currentTime = this.config.mockData ? moment('20:00', 'HH:mm') : moment()
        this.debugLog('Moment now: ', currentTime.format('HH:mm'))

        // Is yesterdays opening hours still in place. (Open over midnight).
        const openingHoursYesterday = store.opening_hours.periods[moment().weekday() - 1]
        let closingTime = moment(openingHoursYesterday.close.time, 'HHmm').weekday(openingHoursYesterday.close.day)
        let openingTime = moment(openingHoursYesterday.open.time, 'HHmm').weekday(openingHoursYesterday.open.day)
        let storeIsOpen = currentTime.isBetween(openingTime, closingTime)

        if (storeIsOpen === false) {
          let openingHoursToday = store.opening_hours.periods[moment().weekday()]
          closingTime = moment(openingHoursToday.close.time, 'HHmm').weekday(openingHoursToday.close.day)
          openingTime = moment(openingHoursToday.open.time, 'HHmm').weekday(openingHoursToday.open.day)
          storeIsOpen = currentTime.isBetween(openingTime, closingTime)
        }
        let openTextCell = openCellTable.insertRow()
        openTextCell.innerHTML = storeIsOpen ? this.translate('OPEN') : this.translate('CLOSED')
        openTextCell.className = 'xsmall'
        openTextCell.style = storeIsOpen ? 'color: green;' : 'color: red;'
        let openingHoursCell = openCellTable.insertRow()
        openingHoursCell.className = 'xsmall'
        if (this.config.styling.showTimeUntil) {
          if (storeIsOpen) {
            let timeUntilClosing = moment.duration(closingTime.diff(currentTime)).humanize()
            openingHoursCell.innerHTML = this.translate('CLOSES_IN', { 'timeUntilClosing': timeUntilClosing })
          } else {
            let timeUntilOpen = moment.duration(currentTime.diff(openingTime)).humanize()
            openingHoursCell.innerHTML = this.translate('OPENS_IN', { 'timeUntilOpen': timeUntilOpen })

          }
        } else {
          if (storeIsOpen) {
            openingHoursCell.innerHTML = this.translate('CLOSES') + ' ' + closingTime.format('HH:mm')
          } else {
            openingHoursCell.innerHTML = this.translate('OPENS') + ' ' + openingTime.format('HH:mm')
          }
        }

        openCell.appendChild(openCellTable)
      })
      container.appendChild(table)
      container.className = this.config.styling.size
    }
    container.style = 'text-align: ' + this.config.styling.textAlign + ';'
    wrapper.appendChild(container)
    return wrapper
  },

  socketNotificationReceived: function (notification, payload) {
    this.debugLog('Notification - ', notification)
    if (notification === 'STORES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      this.storeOpeningHours = payload
      this.debugLog('Stores opening hours: ', this.storeOpeningHours[0])
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