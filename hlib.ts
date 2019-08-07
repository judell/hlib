export type httpOpts = {
  method: string
  url: string
  headers: any
  params: any
}

export type httpResponse = {
  response: any
  status: number
}

export type annotation = {
  id: string
  url: string
  updated: string
  title: string
  refs: string[]
  isReply: boolean
  isPagenote: boolean
  user: string
  text: string
  quote: string
  exact: string
  tags: string[]
  group: string
  target: object
  document: object
}

export type textPositionSelector = {
  type: string
  start: number
  end: number
}

export type textQuoteSelector = {
  type: string
  exact: string
  prefix?: string
  suffix?: string
}

export type inputFormArgs = {
  element: HTMLElement // attach to this element
  name: string // name of the field
  id: string // id + 'Form' is used as a class attr and as id of input element
  value: string // initial value of input element
  onchange: EventHandlerNonNull// handler
  type?: string // usually '' but can be e.g. 'password'
  msg?: string // help message for the field
}

export type settings = {
  // facets
  user: string
  group: string
  url: string
  wildcard_uri: string
  tag: string
  any:string
  // settings
  max: string
  service: string
  exactTagSearch: string
  expanded: string
}

export type toggler = {
  togglerTitle: string
  togglerUnicodeChar: string
}

export const expandToggler:toggler = {
  togglerTitle: 'collapse',
  togglerUnicodeChar: '\u{25bc}'
}

export const collapseToggler:toggler = {
  togglerTitle: 'expand',
  togglerUnicodeChar: '\u{25b6}'
}

const defaultSettings:settings = {
  // facets
  user: '',
  group: 'all',
  url: '',
  wildcard_uri: '',
  tag: '',
  any: '',
  // settings
  max: '50',
  service: 'https://hypothes.is',
  exactTagSearch: 'false',
  expanded: 'false',
}

export const formUrlStorageSyncEvent = new Event('formUrlStorageSync')
export const defaultControlledTags = 'tag1, tag2, tag3'

const clearInputEvent = new Event('clearInput')
const settings = settingsFromLocalStorage()

export function getSettings() {
  return settings
}

export function getDefaultSettings() {
  return defaultSettings
}

export function updateSetting(name:string, value:string) {
  if (name === 'max' && ! value) {
    value = defaultSettings.max
  }
  settings[name] = value
}

export function settingsFromLocalStorage() : settings {
  let value
  try {
    value = localStorage.getItem('h_settings') as string 
  } catch (e) {  // not accessible from a web worker
    return defaultSettings
  }
  let settings = ! value 
    ? {
        // facets
        user: '',
        url: '',
        wildcard_uri: '',
        group: defaultSettings.group,
        tag: '',
        any: '',
        // settings
        max: defaultSettings.max,
        service: defaultSettings.service,
        exactTagSearch: defaultSettings.exactTagSearch,
        expanded: defaultSettings.expanded
      } as settings
    : JSON.parse(value) as settings
    return settings
  }

export function settingsToLocalStorage(settings: settings) {
  localStorage.setItem('h_settings', JSON.stringify(settings))
}

export function settingsToUrl(settings: settings) { 
  let url = new URL(location.href)
  function setOrDelete(settingName:string, settingValue:string, isBoolean?: boolean) {
    // prep 
    if (isBoolean && settingValue === 'false') {
      settingValue = ''
    }   
    // rule
    if (settingValue) {
      url.searchParams.set(settingName, settingValue.toString())
    } else {
      url.searchParams.delete(settingName)
    }
    // exceptions
    if (settingName === 'group' && settingValue === 'all') {
      url.searchParams.delete(settingName)
    }
  }
  // facets
  setOrDelete('user', settings.user)
  setOrDelete('group', settings.group)
  setOrDelete('url', settings.url)
  setOrDelete('wildcard_uri', settings.wildcard_uri)
  setOrDelete('tag', settings.tag)
  setOrDelete('any', settings.any)
  // settings
  setOrDelete('max', settings.max)
  setOrDelete('exactTagSearch', settings.exactTagSearch, true)
  setOrDelete('expanded', settings.expanded, true)
  // special
  url.searchParams.delete('service')
  url.searchParams.delete('subjectUserTokens')
    
  history.pushState(null, '', url.href)
}

/** Promisified XMLHttpRequest 
 *  This predated fetch() and now wraps it. 
 * */ 
export function httpRequest(opts: httpOpts):Promise<httpResponse> {
  return new Promise( (resolve, reject) => {
    const input = new Request(opts.url)
    const init:any = {
      method: opts.method,
      headers: opts.headers
    }
    const method = opts.method.toLowerCase()
    if (method !== 'get' && method !== 'head') {
      init.body = opts.params
    }
    fetch(input, init)
      .then( fetchResponse => {
        return fetchResponse.text()
          .then(text => {
            return  {
              status: fetchResponse.status, 
              response: text,
              headers: fetchResponse.headers,
            }
          })
      })
      .then( finalResponse => {
        resolve ( finalResponse )
      })
      .catch(reason => {
        console.error('rejected', opts, reason)
        reject(reason)
      }) 
  })
}

/** Wrapper for `/api/search` */
export function search(params: any, progressId?: string): Promise<any> {

  function _search(params: any, after: string, annos: object[], replies: object[], progressId?: string) {
    return new Promise ( (resolve, reject) => {
      let max = 2000
      if (params.max) {
        max = params.max
      }

      let limit = 200
      if (max <= limit) {
        limit = max
      }

      if (progressId) {
        getById(progressId).innerHTML += '.'
      }

      const separateReplies = params._separate_replies==='true' ? '&_separate_replies=true' : ''
      const afterClause = after ? `&search_after=${encodeURIComponent(after)}` : ''


      let opts: httpOpts = {
        method: 'get',
        url: `${getSettings().service}/api/search?limit=${limit}${separateReplies}${afterClause}`,
        headers: {},
        params: {}
      }

      const facets = [ 'group', 'user', 'tag', 'url', 'wildcard_uri', 'any']

      facets.forEach(function(facet) {
        if (params[facet]) {
          const encodedValue = encodeURIComponent(params[facet])
          opts.url += `&${facet}=${encodedValue}`
        }
      })

      opts = setApiTokenHeaders(opts)

      httpRequest(opts)
        .then(function(data) {
          const response = JSON.parse(data.response)
          let _annos = response.rows
          let _replies = _annos.filter(a => { return a.hasOwnProperty('references') })
          const replyIds = _replies.map(r => { return r.id })
          _annos = _annos.filter(a => {
            return replyIds.indexOf(a.id) < 0
          })
          annos = annos.concat(_annos)
          replies = replies.concat(_replies)
          const total = annos.length + replies.length
          if (response.rows.length === 0 || total >= max) {
            const result:any = [annos, replies]
            resolve(result)
          } else {
            const sentinel = response.rows.slice(-1)[0].updated
            resolve(_search(params, sentinel, annos, replies, progressId))
          }
        })
        .catch( reason => {
          reject(reason)
        })
    })
  }

  return new Promise (resolve => {
    const annos: object[] = []
    const replies: object[] = []
    const after:string = ''
    resolve(_search(params, after, annos, replies, progressId))
  })
}

export type gatheredResult = {
  updated: string
  title: string
  annos: annotation[]
  replies: annotation[]
}

export type gatheredResults = {
  results: Map<string, gatheredResult>
}

/** Organize a set of annotations, from ${settings.service}/api/search, by url */
export function gatherAnnotationsByUrl(rows: any[]) : gatheredResults {

  const results = {} as gatheredResults
  for (let i = 0; i < rows.length; i++) {
    let result = {} as gatheredResult
    result.updated = ''
    result.title = ''
    result.annos = []
    result.replies = []
    const row = rows[i]
    const anno = parseAnnotation(row) // parse the annotation
    let url = anno.url // remember these things
    url = url.replace(/\/$/, '') // strip trailing slash
    if (! results[url]) {
      results[url] = result
    } 
    if (anno.isReply) {
      results[url].replies.push(anno)
    } else 
    results[url].annos.push(anno)

    const updated = anno.updated
    if (updated > results[url].updated) {
      results[url].updated = updated
    }

    let title = anno.title
    if (! results[url].title) {
      results[url].title = title
    }
  }
  return results
}

/** Parse a row returned from `/api/search` */
export function parseAnnotation(row: any): annotation {
  const id = row.id
  const url = row.uri
  const updated = row.updated.slice(0, 19)
  const group = row.group
  let title = url
  const refs = row.references ? row.references : []
  const user = row.user.replace('acct:', '').replace('@hypothes.is', '')
  let quote = ''
  let exact = ''
  if (row.target && row.target.length) {
    const selectors = row.target[0].selector
    if (selectors) {
      for (let i = 0; i < selectors.length; i++) {
        let selector = selectors[i]
        if (selector.type === 'TextQuoteSelector') {
          quote = `<span title="quote prefix" class="quoteContext">${selector.prefix}</span>`
          quote += `<span title="exact quote" class="quoteExact">${selector.exact}</span> `
          quote += `<span title="quote suffix" class="quoteContext">${selector.suffix}</span>`
          exact = selector.exact
        }
      }
    }
  }
  const text = row.text ? row.text : ''

  const tags = row.tags

  try {
    title = row.document.title
    if (typeof title === 'object') {
      title = title[0]
    } else {
      title = url
    }
  } catch (e) {
    title = url
  }

  const isReply = refs.length > 0

  const isPagenote = row.target && !row.target[0].hasOwnProperty('selector')

 const r: annotation = {
    id: id,
    url: url,
    updated: updated,
    title: title,
    refs: refs,
    isReply: isReply,
    isPagenote: isPagenote,
    user: user,
    text: text,
    quote: quote,
    exact: exact,
    tags: tags,
    group: group,
    target: row.target,
    document: row.document
  }

  return r
}

/** Parse the `target` of a row returned from `/api/search` */
export function parseSelectors(target: any): object {
  const parsedSelectors: any = {}
  const firstTarget = target[0]
  if (firstTarget) {
    const selectors = firstTarget.selector
    if (selectors) {
      const textQuote = selectors.filter(function(x: any) {
        return x.type === 'TextQuoteSelector'
      })
      if (textQuote.length) {
        parsedSelectors['TextQuote'] = {
          exact: textQuote[0].exact,
          prefix: textQuote[0].prefix,
          suffix: textQuote[0].suffix
        }
      }
      const textPosition = selectors.filter(function(x: any) {
        return x.type === 'TextPositionSelector'
      })
      if (textPosition.length) {
        parsedSelectors['TextPosition'] = {
          start: textPosition[0].start,
          end: textPosition[0].end
        }
      }
      const range = selectors.filter(function(x: any) {
        return x.type === 'RangeSelector'
      })
      if (range.length) {
        parsedSelectors['Range'] = {
          startContainer: range[0].startContainer,
          endContainer: range[0].endContainer
        }
      }   
    }
  }
  return parsedSelectors
}

/** Get url parameters */
export function gup(name: string, str?: string): string {
  if (!str) {
    str = window.location.href
  } else {
    str = '?' + str
  }
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]')
  const regexS = '[\\?&]' + name + '=([^&#]*)'
  const regex = new RegExp(regexS)
  const results = regex.exec(str)
  if (results == null) {
    return ''
  } else {
    return results[1]
  }
}

export function getById(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement
}

export function appendBody(element: HTMLElement) {
  document.body.appendChild(element)
}

export function getDomainFromUrl(url: string): string {
  let a = document.createElement('a')
  a.href = url
  return a.hostname
}

/** Add a token authorization header to the options that govern an `httpRequest`. 
 * If the token isn't passed as a param, try getting it from local storage.
*/
export function setApiTokenHeaders(opts: httpOpts, token?: string): httpOpts {
  if (!token) {
    token = getToken()
  }
  if (token) {
    opts.headers = {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json;charset=utf-8'
    }
  }
  return opts
}

/** Acquire a Hypothesis API token */
export function getToken() {
  return getTokenFromLocalStorage()
}

/** Save a Hypothesis API token. */
export function setToken() {
  setLocalStorageFromForm('tokenForm', 'h_token')
  location.href = location.href
}

/** Acquire a Hypothesis group id */
export function getGroup() {
  const group = getSettings().group
  return group != '' ? group : '__world__'
}

export function syncContainer(name: string) {
  return function() {
    syncUrlAndLocalStorageFromForm(`${name}Container`) 
  }
}

function syncUrlAndLocalStorageFromForm(formId: string) {
  const form = getById(formId)
  const keyElement = form.querySelector('.formLabel') as HTMLElement
  const key = keyElement.innerText 
  const inputElement = form.querySelector('input') as HTMLInputElement
  let value:string
  if (inputElement.type === 'checkbox') {
    value = inputElement.checked ? 'true' : 'false'
  } else 
    value = inputElement.value
  updateSetting(key, value)
  settingsToUrl(getSettings())
  settingsToLocalStorage(getSettings())
  form.dispatchEvent(formUrlStorageSyncEvent)
}

/** Save value of a form field. */
export function setLocalStorageFromForm(formId: string, storageKey: string) {
  const element = getById(formId) as HTMLInputElement
  localStorage.setItem(storageKey, element.value)
}

/** Helper for `createAnnotationPayload`.  */
export function createPermissions(username: string, group: string) {
  const permissions = {
    read: [ 'group:' + group ],
    update: [ 'acct:' + username + '@hypothes.is' ],
    delete: [ 'acct:' + username + '@hypothes.is' ]
  }
  return permissions
}

/** Helper for `createAnnotationPayload` */
export function createTextQuoteSelector(exact: string, prefix: string, suffix: string): textQuoteSelector {
  const tqs: textQuoteSelector = {
    type: 'TextQuoteSelector',
    exact: exact,
    prefix: '',
    suffix: ''
  }
  if (prefix) {
    tqs.prefix = prefix
  }
  if (suffix) {
    tqs.suffix = suffix
  }
  return tqs
}

/** Helper for `createAnnotationPayload` */
export function createTextPositionSelector(start: number, end: number): textPositionSelector {
  const tps: textPositionSelector = {
    type: 'TextPositionSelector',
    start: start,
    end: end
  }
  return tps
}

/** Form the JSON payload that creates an annotation.
 * 
 * Expects an object with these keys:
 * ```
 * uri: Target to which annotation will post
 * exact, prefix, suffix: Info for TextQuoteSelector, only exact is required
 * start, stop: Info for TextPositionSelector, optional
 * username: Hypothesis username
 * group: Hypothesis group (use `__world__` for Public, ignored if you are posting a reply)
 * text: Body of annotation (could be markdown or html)
 * tags: Hypothesis tags
 * references: Array of ids. To post a reply: [ '{threadRootId}' ]
 * extra: Extra data, invisible to user but available through H API
 * ```
 */
export function createAnnotationPayload(params: any): string {
  // uri, exact, username, group, text, tags, references, extra
  let textQuoteSelector
  let textPositionSelector

  if (params.exact) {
    // we have minimum info need for a TextQuoteSelector
    textQuoteSelector = createTextQuoteSelector(params.exact, params.prefix, params.suffix)
  }

  if (params.start && params.end) {
    textPositionSelector = createTextPositionSelector(params.start, params.end)
  }

  const target: any = {
    source: params.uri
  }

  if (textQuoteSelector) {
    // we have minimum info for an annotation target
    const selectors: object[] = [ textQuoteSelector ]
    if (textPositionSelector) {
      // we can also use TextPosition
      selectors.push(textPositionSelector)
    }
    target['selector'] = selectors
  }

  const payload: any = {
    target: [ target ],
    uri: params.uri,
    group: params.group,
    permissions: createPermissions(params.username, params.group),
    text: params.text,
    document: {
      title: [ params.uri ]
    },
    tags: params.tags ? params.tags : []
  }
  
  if (params.references) {
    payload.references = params.references
  }

  if (params.extra) {
    payload.extra = params.extra
  }

  return JSON.stringify(payload)
}

/** Create an annotation */
export function postAnnotation(payload: string, token: string) {
  const url = `${getSettings().service}/api/annotations`
  let opts: httpOpts = {
    method: 'post',
    params: payload,
    url: url,
    headers: {}
  }

  opts = setApiTokenHeaders(opts, token)

  return httpRequest(opts)
}

/** Create an annotation and redirect to the annotated page,
 * optionally with a client-side query.
 */
export function postAnnotationAndRedirect(payload: string, token: string, queryFragment?: string) {
  return postAnnotation(payload, token)
    .then(data => {
      const _data:any = data
      const status:number = _data.status
      if (status != 200) {
        alert(`hlib status ${status}`)
        return
      }
      const response = JSON.parse(_data.response)
      let url = response.uri
      if (queryFragment) {
        url += '#' + queryFragment
      }
      location.href = url
    })
    .catch((e) => {
      console.error(e)
    })
}

export function getAnnotation(id: string, token: string) {
  const url = `${getSettings().service}/api/annotations/${id}`
  let opts: httpOpts = {
    method: 'get',
    params: {},
    url: url,
    headers: {}
  }
  opts = setApiTokenHeaders(opts, token)
  return httpRequest(opts)
}

export function updateAnnotation(id: string, token: string, payload: string) {
  const url = `${getSettings().service}/api/annotations/${id}`
  let opts: httpOpts = {
    method: 'put',
    params: payload,
    url: url,
    headers: {}
  }
  opts = setApiTokenHeaders(opts, token)
  return httpRequest(opts)
}

export function deleteAnnotation(id: string, token: string) {
  const url = `${getSettings().service}/api/annotations/${id}`
  let opts: httpOpts = {
    method: 'delete',
    url: url,
    headers: {},
    params: {}
  }
  opts = setApiTokenHeaders(opts, token)
  return httpRequest(opts)
}

/** Input form for an API token, remembered in local storage. */
export function createApiTokenInputForm(element: HTMLElement) {
  const tokenArgs: inputFormArgs = {
    element: element,
    name: 'Hypothesis API token',
    id: 'token',
    value: getToken(),
    onchange: setToken,
    type: 'password',
    msg:
      `Find it by logging in <a title="Your Hypothesis account" target="_token" href="${getSettings().service}/profile/developer">here</a>`
  }
  createNamedInputForm(tokenArgs)
}


export function createInputForm(name: string, handler: EventHandlerNonNull, element: HTMLElement, type?: string, msg?: string) {
  const params: inputFormArgs = {
    element: element,
    name: name,
    id: `${name}`,
    value: getSettings()[name],
    onchange: handler,
    type: type ? type : '',
    msg: msg ? msg : ''
  }
  createNamedInputForm(params)
}

export function createUserInputForm(element: HTMLElement, msg?: string) {
  if (! msg) {
    msg = 'For search, not authentication'
  }
  const name = 'user'
  createInputForm(name, syncContainer(name), element, '', msg)
}

export function createUrlInputForm(element: HTMLElement) {
  const name = 'url'
  createInputForm(name, syncContainer(name), element, '', 'URL of annotated document')
}

export function createWildcardUriInputForm(element: HTMLElement) {
  const name = 'wildcard_uri'
  createInputForm(name, syncContainer(name), element, '', 'e.g. https://www.nytimes.com/*')
}

export function createTagInputForm(element: HTMLElement, msg?: string) {
  const name = 'tag'
  createInputForm(name, syncContainer(name), element, '', msg)
}

export function createAnyInputForm(element: HTMLElement, msg?: string) {
  const name = 'any'
  createInputForm(name, syncContainer(name), element, '', msg)
}

export function createMaxInputForm(element: HTMLElement, msg?: string) {
  const name = 'max'
  createInputForm(name, syncContainer(name), element, '', msg)
}

export function createExactTagSearchCheckbox(element: HTMLElement) {
  const name = 'exactTagSearch'  
  createInputForm(name, syncContainer(name), element, 'checkbox')
}

export function createExpandedCheckbox(element: HTMLElement) {
  const name = 'expanded'  
  createInputForm(name, syncContainer(name), element, 'checkbox')
}

/** Create an input field with a handler to save the changed value,
 *  optionally with a default value, optionally with a type (e.g. password).
 *  Should be renamed to createUrlAndStorageSyncedInputForm
 */
export function createNamedInputForm(args: inputFormArgs) {
  const { element, name, id, value, onchange, type, msg } = args
  const _type = type ? `type="${type}"` : ''
  let _value = ''
  let _checked
  if (type !== 'checkbox') { 
    _value = `value="${value}"`
  } else {
    _checked = value === 'true' ? `checked="true"` : ''
  }
  let form
  if (type !== 'checkbox') {
    form = `
      <div class="formLabel">${name}</div>
      <div class="${id}Form"><input ondrop="dropHandler(event)" ${_type} ${_value} 
        id="${id}Form"></input><a title="clear input" class="clearInput"> x</a></div>
      <div class="formMessage">${msg}</div>`
  } else {
    form = `
      <div class="checkboxContainer">
        <div class="formLabel">${name}</div>
        <div class="${id}Form"><input type="${type}" ${_checked} id="${id}Form"></div>
      </div>
      <div class="formMessage"></div>`
  }
  element.innerHTML += form
  const inputElement = element.querySelector('input') as HTMLElement
  inputElement.onchange = onchange
  if (type !== 'checkbox') {
    const clearElement = element.querySelector('.clearInput') as HTMLAnchorElement
    clearElement.onclick = clearInput
  }
  return element // return value used for testing
}

/** Create a simple input field. */
export function createFacetInputForm(e: HTMLElement, facet: string, msg?: string, value?: string) {
  if (!msg) { msg = '' }
  if (!value) { value = '' }
  const form = `
    <div class="formLabel">${facet}</div>
    <div class="${facet}Form"><input value="${value}" id="${facet}Form"></input></div>
    <div class="formMessage">${msg}</div>`
  e.innerHTML += form
  return e // for testing
}

export function setSelectedGroup(selectId:string) {
  const selectedGroup = getSelectedGroup(selectId)
  updateSetting('group', selectedGroup)
  const settings = getSettings()
  settingsToLocalStorage(settings)
  settingsToUrl(settings)
}

export function getSelectedGroupInfo(selectId?:string) {
  let _selector = selectId ? selectId : 'groupsList'
  _selector = '#' + _selector
  const groupSelector = document.querySelector(_selector) as HTMLSelectElement
  const options:HTMLOptionsCollection = groupSelector.options
  const selectedGroup = options[options.selectedIndex].value
  const selectedGroupName = options[options.selectedIndex].innerText
  return {
    selectedGroup: selectedGroup,
    selectedGroupName: selectedGroupName
  }
}

export function getSelectedGroup(selectId?:string) {
  return getSelectedGroupInfo(selectId).selectedGroup
}

export function getSelectedGroupName(selectId?:string) {
  return getSelectedGroupInfo(selectId).selectedGroupName
}

/** Create a Hypothesis group picker. */
export function createGroupInputForm(e: HTMLElement, selectId?: string) {
  return new Promise( (resolve,reject) => {
    const _selectId:string = selectId ? selectId : 'groupsList'
    
    function createGroupSelector(groups: any, selectId?: string) {
      localStorage.setItem('h_groups', JSON.stringify(groups))
      const currentGroup = getGroup()
      let options = ''
      groups.forEach(function(g: any) {
        let selected = ''
        if (currentGroup == g.id) {
          selected = 'selected'
        }
        options += `<option ${selected} value="${g.id}">${g.name}</option>\n`
      })
      const selector = `
        <select id="${_selectId}">
        ${options}
        </select>`
      return selector
    }

    const token = getToken()

    let opts: httpOpts = {
      method: 'get',
      url: `${getSettings().service}/api/profile`,
      headers: {},
      params: {}
    }
    opts = setApiTokenHeaders(opts, token)
    httpRequest(opts)
      .then((data:any) => {
        const wrappedSetSelectedGroup = function () {
          return setSelectedGroup(_selectId)
        }
        const response: any = JSON.parse(data.response)
        let msg = ''
        if (!token) {
          msg = 'Add token and <a href="javascript:location.href=location.href">refresh</a> to see all groups here'
        }
        const form = `
          <div class="formLabel">group</div>
          <div class="inputForm">${createGroupSelector(response.groups, _selectId)}</div>
          <div class="formMessage">${msg}</div>`
        e.innerHTML += form
        const groupPicker = getById(_selectId) as HTMLSelectElement
        groupPicker.onchange = wrappedSetSelectedGroup
        return data
      })
      .then (data => {
        resolve(data)
      })
      .catch((e) => {
        reject(e)
      })
    })
}

/** Render a list of tags. By default, the links work as in ${settings.service}judell/facet.
 * Use the optional `urlPrefix` with `${settings.service}/search?q=tag:` to override
 * with links to the Hypothesis viewer.
 */
export function formatTags(tags: string[], urlPrefix?: string): string {
  const formattedTags: string[] = []
  tags.forEach(function(tag) {
    const url = urlPrefix ? urlPrefix + tag : `./?tag=${tag}`
    const formattedTag = `<a target="_tag" href="${url}"><span class="annotationTag">${tag}</span></a>`
    formattedTags.push(formattedTag)
  })
  return formattedTags.join(' ')
}

/** Format an annotation as a row of a CSV export. */
export function csvRow(level: number, anno: any): string {
  let fields = [
    level.toString(),
    anno.updated,
    anno.url,
    anno.user,
    anno.id,
    anno.group,
    anno.tags.join(', '),
    anno.quote,
    anno.text
  ]
  fields.push(`https://hyp.is/${anno.id}`) // add hyp.is link
  fields.push(`${anno.url}#annotations:${anno.id}`) // add direct link
  fields = fields.map(function(field) {
    if (field) {
      field = field.replace(/&/g, '&amp;') // the resulting text will be added as html to the dom
      field = field.replace(/</g, '&lt;')
      field = field.replace(/\s+/g, ' ') // normalize whitespace
      field = field.replace(/"/g, '""') // escape double quotes
      field = field.replace(/\r?\n|\r/g, ' ') // remove cr lf
      field = `"${field}"` // quote the field
    }
    return field
  })
  return fields.join(',')
}

/** Render an annotation card. */
export function showAnnotation(anno: annotation, level: number, tagUrlPrefix?: string, externalLink?: string, copyIdButton?: string) {

  function getGroupName(anno:any):any {
    let groupName = anno.group
    let groups:any = {}
    const groupsJson = localStorage.getItem('h_groups')
    if ( groupsJson) {
      groups = JSON.parse(groupsJson)
      const groupRecords = groups.filter(g => {return g.id === anno.group})
      if (groupRecords.length) {
        groupName = groupRecords[0].name
      }
    }
    return groupName
  }

  // the body is sanitized by markdown but the quote,
  // which now includes prefix, exact, and suffix, needs escaping
  function sanitizeQuote(html: string) {
    const tagsToEscape = ['iframe']
    for (let tag of tagsToEscape) {
      const regex = new RegExp('<' + tag, 'i' )
      html = html.replace(regex, '&lt;' + tag)
    }
    return html
  }
  const dt = new Date(anno.updated)
  const dt_str = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString().replace(/:\d{2}\s/, ' ')

  let html = anno.text == null ? '' : anno.text
  let converter
  if (typeof(Showdown) === 'object') {
    converter = new Showdown.converter()
  } else {
    converter = new showdown.Converter()
  }
  html = converter.makeHtml(html)

  let tags = ''
  if (anno.tags.length) {
    tags = formatTags(anno.tags, tagUrlPrefix)
  }

  const user = anno.user.replace('acct:', '').replace('@hypothes.is', '')

  const standaloneAnnotationUrl = `${settings.service}/a/${anno.id}`

  const _externalLink = externalLink ? externalLink : `
    <a title="view/edit/reply" target="_standalone" href="${standaloneAnnotationUrl}">
      <img class="externalLinkImage" src="https://jonudell.info/hlib/externalLink.png">
    </a>`
 
  const _copyIdButton = copyIdButton ? copyIdButton : `
    <button onclick="(function(){navigator.clipboard.writeText('${anno.id}')})();">${anno.id}</button>`

  const marginLeft = level * 20

  const groupName = getGroupName(anno)

  let groupSlug = 'in Public'
  if (anno.group !== '__world__') {
    groupSlug = `
      in <span class="groupid"><a title="search group" target="_group" href="./?group=${anno.group}">${groupName}</a>
      </span>`
  }

  const type = anno.isReply ? 'reply' : 'annotation'
  const downRightArrow = anno.isReply 
    ? `<div class="downRightArrow" style="margin-top:-8px; margin-bottom:-32px; margin-left:${marginLeft-12}px">\u{2937}</div>`
    : ''

  let userCanEdit = false
  const svgIconMarkup = '<span is="edit-or-save-icon"></span>'
  const subjectUserTokens = getSubjectUserTokensFromLocalStorage()
  if (subjectUserTokens.hasOwnProperty(anno.user)) {
    userCanEdit = true
  }

  const output = `
    ${downRightArrow}
    <div class="annotationCard ${type}" id="_${anno.id}" style="display:block; margin-left:${marginLeft}px;">
      <annotation-editor edit-or-save-icon-state="viewing">
        <div class="annotationHeader">
          <span class="user">
            <a title="search user" target="_user"  href="./?user=${user}">${user}</a>
          </span>
          <span>&nbsp;</span>
          <span class="dateTime">${dt_str}</span>
          <span>&nbsp;</span>
          <span class="groupSlug">${groupSlug}</span>
          <span>&nbsp;</span>
          <span class="externalLink">${_externalLink}</span>
          <span>&nbsp;</span>
          <span class="copyIdButton">${_copyIdButton}</span>
        </div>
        <div class="annotationQuote">
          ${sanitizeQuote(anno.quote)}
        </div>
        <div class="annotationText">
          ${userCanEdit ? svgIconMarkup : ''}
          <div class="annotationBody">
            ${html}
          </div>
        </div>
        <div class="annotationTags">${tags}</div>
      </annotation-editor>
    </div>`

  return output
}

/** Save exported annotations to a file. */
export function download(text: string, type: string) {
  const blob = new Blob([ text ], {
    type: 'application/octet-stream'
  })
  const url = URL.createObjectURL(blob)
  let a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.download = 'hypothesis.' + type
  document.body.appendChild(a)
  a.click()
}
// https://gist.github.com/monsur/706839
/**
 * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
 * headers according to the format described here:
 * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
 * This method parses that string into a user-friendly key/value pair object.
 */
export function parseResponseHeaders(headerStr: string): object {
  const headers: any = {}
  if (!headerStr) {
    return headers
  }
  const headerPairs = headerStr.split('\u000d\u000a')
  for (let i = 0; i < headerPairs.length; i++) {
    const headerPair = headerPairs[i]
    // Can't use split() here because it does the wrong thing
    // if the header value has the string ": " in it.
    const index = headerPair.indexOf('\u003a\u0020')
    if (index > 0) {
      const key = headerPair.substring(0, index)
      const val = headerPair.substring(index + 2)
      headers[key] = val
    }
  }
  return headers
}

/** Collapse all annotation cards. */
export function collapseAll() {
  const togglers: NodeListOf<HTMLElement> = document.querySelectorAll('.urlHeading .toggle')
  togglers.forEach(function(toggler) {
    setToggleControlCollapse(toggler)
  })
  const cards: NodeListOf<HTMLElement> = document.querySelectorAll('.annotationCard')
  hideCards(cards)
}

/** Expand all annotation cards. */
export function expandAll() {
  const togglers: NodeListOf<HTMLElement> = document.querySelectorAll('.urlHeading .toggle')
  togglers.forEach((toggler) => {
    setToggleControlExpand(toggler)
  })
  const cards: NodeListOf<HTMLElement> = document.querySelectorAll('.annotationCard')
  showCards(cards)
}

function findArrows(toggler: HTMLElement) {
  const header = toggler.closest('.urlHeading') as HTMLElement
  const cards = header.nextElementSibling as HTMLElement
  return cards.querySelectorAll('.downRightArrow') as NodeListOf<HTMLElement>
}

/** Set expand/collapse toggle to collapsed. */
export function setToggleControlCollapse(toggler: HTMLElement) {
  toggler.innerHTML = collapseToggler.togglerUnicodeChar
  toggler.title = collapseToggler.togglerTitle
  const downRightArrows = findArrows(toggler)
  downRightArrows.forEach(arrow => {
    arrow.style.display = 'none'
  })
}

/** Set expand/collapse toggle to expanded. */
export function setToggleControlExpand(toggler: HTMLElement) {
  toggler.innerHTML = expandToggler.togglerUnicodeChar
  toggler.title = expandToggler.togglerTitle
  const downRightArrows = findArrows(toggler)
  downRightArrows.forEach(arrow => {
    arrow.style.display = 'block'
  })
}

/** Show a setof annotation cards. */
export function showCards(cards: NodeListOf<HTMLElement>) {
  for (let i = 0; i < cards.length; i++) {
    cards[i].style.display = 'block'
  }
}

/** Hide a set of annotation cards. */
export function hideCards(cards: NodeListOf<HTMLElement>) {
  for (let i = 0; i < cards.length; i++) {
    cards[i].style.display = 'none'
  }
}

/** Switch the expand/collapse state of an annotation card. */
export function toggle(id: string) {
  const heading = getById('heading_' + id)
  const toggler = heading.querySelector('.toggle') as HTMLElement

  const cardsId = `cards_${id}`
  const selector = `#${cardsId} .annotationCard`
  const perUrlCards: NodeListOf<HTMLElement> = document.querySelectorAll(selector)
  const cardsDisplay = perUrlCards[0].style.display

  if (cardsDisplay === 'block') {
    setToggleControlCollapse(toggler)
    hideCards(perUrlCards)
  } else {
    setToggleControlExpand(toggler)
    showCards(perUrlCards)
  }
}

export function getTokenFromLocalStorage() {
  const value = localStorage.getItem('h_token')
  return value ? value : ''
}

export function getUserFromLocalStorage() {
  const value = localStorage.getItem('h_user')
  return value ? value : ''
}

/** Display the params a bit less plainly
 */

export function syntaxColorParams(params:settings, excluded:string[]) : string {
  const keys = Object.keys(params) as string[]
  function wrappedKey(key: string) {
    return `<span class="params key">${key}</span>`
  }
  function wrappedValue(value: string) {
    return `<span class="params value">${value}</span>`
  }
  let buffer = ''
  const pairs = []
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (excluded.indexOf(key) != -1) {
      continue
    }
    const value = params[key]
    pairs.push(`"${wrappedKey(key)}" : "${wrappedValue(value)}"`)
  }
  const html = `<pre class="params">${pairs.join(', ')}</pre>`  
  return html
}

function clearInput(e: MouseEvent) {
  const target = e.target as HTMLElement
  const formElement = target.closest('.formField') as HTMLElement
  const inputElement = formElement.querySelector('input') as HTMLInputElement
  inputElement.value = ''
  const setting  = formElement.id.replace('Container','')
  updateSetting(setting, '')
  settingsToUrl(getSettings())
  settingsToLocalStorage(getSettings())
  const formField = target.closest('.formField') as HTMLElement
  formField.dispatchEvent(clearInputEvent)
}

export function getSubjectUserTokensFromLocalStorage() {
  let subjectUserTokens = {} as Map<string, string>
  const _subjectUserTokens = localStorage.getItem('h_subjectUserTokens')
  if (_subjectUserTokens) {
    subjectUserTokens = JSON.parse(_subjectUserTokens) 
  } else {
    subjectUserTokens = JSON.parse(`{"user1" : "token1", "user2" : "token2"}`) as Map<string,string>
  }
  return subjectUserTokens
}

export function saveSubjectUserTokensToLocalStorage(value: string) {
  try {
    value = value.replace(/[,\n}]+$/, '\n}') // silently fix most likely error
    if (value === '') { value = '{}' }
    JSON.parse(value)
    localStorage.setItem('h_subjectUserTokens', value)
    return true
  } catch (e) {
    alert(`That is not valid JSON. Format is "name" : "token" pairs, comma-separated.
        Please check your input at https://jsoneditoronline.org/`)
    return false
  }
}

export function getControlledTagsFromLocalStorage() {
  const controlledTags = localStorage.getItem('h_controlledTags')
  return controlledTags ? controlledTags : defaultControlledTags
}

export function saveControlledTagsToLocalStorage(value: string) {
  localStorage.setItem('h_controlledTags', value)
}

export function insertNodeAfter(newNode:HTMLElement, referenceNode:HTMLElement) {
  referenceNode.parentNode!.insertBefore(newNode, referenceNode.nextSibling)  
}

/* manageTokenDisplayAndReset is called like so in facet and elsewhere

<script>
  setTimeout(_ => {
    hlib.manageTokenDisplayAndReset()
  }, 200)
</script>
</body>

It works with a page element like this:

<div class="tokenReset">
  <a title="click to reset">reset API token</a>
</div>

*/

export function manageTokenDisplayAndReset() {
  function resetToken() {
    localStorage.setItem('h_token', '')
  }    
  let token = getToken()
  const tokenContainer = getById('tokenContainer')
  const tokenResetter = document.querySelector('.tokenReset') as HTMLElement
  if (token) {
    tokenContainer.style.display = 'none'
    tokenResetter.style.display = 'block'
  } else {
    tokenContainer.style.display = 'block'
    tokenResetter.style.display = 'none'
  }
  tokenResetter.onclick = function() {
    resetToken()
    location.href = location.href
  }
}

export async function delaySeconds(seconds: number) {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

export function maybeTruncateAndAddEllipsis(str: string, count: number) {
  if (str.length > count) {
    str = str.slice(0, 30) + ' ...'
  }
  return str
}

export function displayKeysAndHiddenValues(dictionary: Map<string,string>) {
  let newDictionary: Map<string,string> = Object.assign({}, dictionary)
  Object.keys(newDictionary).forEach(function (key) {
      newDictionary[key] = '***'
    })
  return maybeTruncateAndAddEllipsis(JSON.stringify(newDictionary), 30)
}

// custom elements

class EditOrSaveIcon extends HTMLSpanElement {
  controllingElement: HTMLElement
  clickHandlerAttached: boolean
  static controllingAttribute: string = 'edit-or-save-icon-state'
  constructor() {
    super()
    this.controllingElement = this
    this.clickHandlerAttached = false
  }
  connectedCallback() {
    this.controllingElement = this.closest(`*[${EditOrSaveIcon.controllingAttribute}]`) as HTMLElement
    function handler() {
      if (this.controllingElement.getAttribute(`${EditOrSaveIcon.controllingAttribute}`) === 'viewing') {
        this.controllingElement.setAttribute(`${EditOrSaveIcon.controllingAttribute}`,'editing')
      } else {
        this.controllingElement.setAttribute(`${EditOrSaveIcon.controllingAttribute}`,'viewing')
      }
    }
    if (! this.clickHandlerAttached) {
      this.addEventListener('click', handler)
      this.clickHandlerAttached = true
    }
    const state = this.controllingElement.getAttribute(`${EditOrSaveIcon.controllingAttribute}`)
    let iconName
    if (state === 'viewing') {
      iconName = 'icon-pencil' // viewing, offer to edit
    } else { 
      iconName = 'icon-floppy' // editing, offer to save
    }
    this.innerHTML = `<svg class="${iconName}"><use xlink:href="#${iconName}"></use></svg>`
  }
}

customElements.define('edit-or-save-icon', EditOrSaveIcon, { extends: "span" })

// subject user tokens

class SubjectUserTokensEditor extends HTMLDivElement {
  static get observedAttributes() { return [`${EditOrSaveIcon.controllingAttribute}`] }
  constructor() {
    super()
  }
  connectedCallback() {
    this.innerHTML = '<div class="formLabel">subject user tokens</div>'
  }
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {

    if (!oldValue) { return }
    if (name === EditOrSaveIcon.controllingAttribute) {
      if (oldValue === 'viewing') {
        this.querySelector('*[is="subject-user-tokens-display"]')!.remove()
        this.innerHTML += `<textarea is="subject-user-tokens-input" class="subjectUserTokensInput" />`
      } else {
        if (saveSubjectUserTokensToLocalStorage(this.querySelector('textarea')!.value)) {
          this.querySelector('*[is="subject-user-tokens-input"]')!.remove()
          this.innerHTML += `<span is="subject-user-tokens-display" class="subjectUserTokensDisplay" />`
        } else {
          return
        }
      }
      this.querySelector('*[is="edit-or-save-icon"]')!.remove()
      this.innerHTML += ` <span is="edit-or-save-icon"/>`
    }
  }
}
customElements.define('subject-user-tokens-editor', SubjectUserTokensEditor, { extends: "div" })

class SubjectUserTokensDisplay extends HTMLSpanElement {
  constructor() {
    super()
  }
  connectedCallback() {
    const subjectUserTokens = getSubjectUserTokensFromLocalStorage()
    const hiddenUserTokens = displayKeysAndHiddenValues(subjectUserTokens)      
    this.innerText = hiddenUserTokens
  }
}
customElements.define('subject-user-tokens-display', SubjectUserTokensDisplay, { extends: "span" })

class SubjectUserTokensInput extends HTMLTextAreaElement {
  constructor() {
    super()
  }
  connectedCallback() {
    const subjectUserTokens = getSubjectUserTokensFromLocalStorage()  
    const formattedSubjectUserTokens = JSON.stringify(subjectUserTokens, null, 2).trim()    
    this.innerHTML = formattedSubjectUserTokens
  }
}
customElements.define('subject-user-tokens-input', SubjectUserTokensInput, { extends: "textarea" })

// controlled tags

class ControlledTagsEditor extends HTMLDivElement {
  static get observedAttributes() { return [`${EditOrSaveIcon.controllingAttribute}`] } 
  constructor() {
    super()
  }
  connectedCallback() {
    this.innerHTML = '<div class="formLabel">controlled tags</div>'
  }
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (!oldValue) { return }
    if (name === EditOrSaveIcon.controllingAttribute) {
      if (oldValue === 'viewing') {
        this.querySelector('*[is="controlled-tags-display"]')!.remove()
        this.innerHTML += `<textarea is="controlled-tags-input" class="controlledTagsInput" />`
      } else {
        saveControlledTagsToLocalStorage(this.querySelector('textarea')!.value)
        this.querySelector('*[is="controlled-tags-input"]')!.remove()
        this.innerHTML += `<span is="controlled-tags-display" class="controlledTagsDisplay" />`
      }
      this.querySelector('*[is="edit-or-save-icon"]')!.remove()
      this.innerHTML += ` <span is="edit-or-save-icon"/>`
    }
  }
}
customElements.define('controlled-tags-editor', ControlledTagsEditor, { extends: "div" })

class ControlledTagsDisplay extends HTMLSpanElement {
  constructor() {
    super()
  }
  connectedCallback() {
    this.innerText = maybeTruncateAndAddEllipsis(getControlledTagsFromLocalStorage(), 30)
  }
}
customElements.define('controlled-tags-display', ControlledTagsDisplay, { extends: "span" })

class ControlledTagsInput extends HTMLTextAreaElement {
  constructor() {
    super()
  }
  connectedCallback() {
    this.innerText = getControlledTagsFromLocalStorage()
  }
}
customElements.define('controlled-tags-input', ControlledTagsInput, { extends: "textarea" })

// annotation card

class AnnotationEditor extends HTMLElement {
  static get observedAttributes() { return [`${EditOrSaveIcon.controllingAttribute}`] }   
  constructor() {
    super()
  }
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {

    if (!oldValue) { return }
    this.querySelector('*[is="edit-or-save-icon"]')!.remove()
    const body = this.querySelector('.annotationBody')! as HTMLElement
    if (name === EditOrSaveIcon.controllingAttribute) {
      if (oldValue === 'viewing') {
        body.setAttribute('contentEditable', 'true')
        body.style.backgroundColor = 'rgb(241, 238, 234)'
      } else {
        body.removeAttribute('contentEditable')
        body.style.backgroundColor = null
      }
    }
    this.querySelector('.annotationText')!.innerHTML = '<span is="edit-or-save-icon"></span>' + body.outerHTML
  }
}
customElements.define('annotation-editor', AnnotationEditor)


// icons

export const svgIcons = `
<svg style="position: absolute; width: 0; height: 0; overflow: hidden" version="1.1" xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <symbol id="icon-floppy" viewBox="0 0 353.073 353.073">
      <path d="M340.969,0H12.105C5.423,0,0,5.423,0,12.105v328.863c0,6.68,5.423,12.105,12.105,12.105h328.864
       c6.679,0,12.104-5.426,12.104-12.105V12.105C353.073,5.423,347.647,0,340.969,0z M67.589,18.164h217.895v101.884H67.589V18.164z
       M296.082,327.35H57.003V176.537h239.079V327.35z M223.953,33.295h30.269v72.638h-30.269V33.295z M274.135,213.863H78.938v-12.105
       h195.197V213.863z M274.135,256.231H78.938v-12.105h195.197V256.231z M274.135,297.087H78.938v-12.105h195.197V297.087z"/>
    <title>save</title>
  </symbol>
  <symbol id="icon-pencil" viewBox="0 0 512 512">
     <title>edit</title>
     <path d="M311.18,78.008L32.23,356.958L0.613,485.716c-1.771,7.209,0.355,14.818,5.604,20.067
       c5.266,5.266,12.88,7.368,20.067,5.604l128.759-31.617l278.95-278.95L311.18,78.008z M40.877,471.123l10.871-44.271l33.4,33.4
       L40.877,471.123z"/>
     <path d="M502.598,86.818L425.182,9.402c-12.536-12.536-32.86-12.536-45.396,0l-30.825,30.825l122.812,122.812l30.825-30.825
       C515.134,119.679,515.134,99.354,502.598,86.818z"/>
  </symbol>
  <symbol id="icon-delete" viewBox="0 0 348.333 348.334">
      <title>delete</title>
      <path d="M336.559,68.611L231.016,174.165l105.543,105.549c15.699,15.705,15.699,41.145,0,56.85
      c-7.844,7.844-18.128,11.769-28.407,11.769c-10.296,0-20.581-3.919-28.419-11.769L174.167,231.003L68.609,336.563
      c-7.843,7.844-18.128,11.769-28.416,11.769c-10.285,0-20.563-3.919-28.413-11.769c-15.699-15.698-15.699-41.139,0-56.85
      l105.54-105.549L11.774,68.611c-15.699-15.699-15.699-41.145,0-56.844c15.696-15.687,41.127-15.687,56.829,0l105.563,105.554
      L279.721,11.767c15.705-15.687,41.139-15.687,56.832,0C352.258,27.466,352.258,52.912,336.559,68.611z"/>
  </symbol>
  <title>view/edit/reply</title>
  <symbol id="icon-external-link" viewBox="0 0 26 26">
      <path d="M18,17.759v3.366C18,22.159,17.159,23,16.125,23H4.875C3.841,23,3,22.159,3,21.125V9.875
        C3,8.841,3.841,8,4.875,8h3.429l3.001-3h-6.43C2.182,5,0,7.182,0,9.875v11.25C0,23.818,2.182,26,4.875,26h11.25
        C18.818,26,21,23.818,21,21.125v-6.367L18,17.759z"/>
      <path d="M22.581,0H12.322c-1.886,0.002-1.755,0.51-0.76,1.504l3.22,3.22l-5.52,5.519
        c-1.145,1.144-1.144,2.998,0,4.141l2.41,2.411c1.144,1.141,2.996,1.142,4.14-0.001l5.52-5.52l3.16,3.16
        c1.101,1.1,1.507,1.129,1.507-0.757L26,3.419C25.999-0.018,26.024-0.001,22.581,0z"/>
  </symbol>
</defs>
</svg>
`