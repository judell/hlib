type httpOpts = {
	method: string
	url: string
	headers: any
	params: any
}

type httpResponse = {
	response: any
	status: number
	statusText: string
	headers: any
}

type annotation = {
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
	tags: string[]
	group: string
	target: object
}

type textPositionSelector = {
	type: string
	start: number
	end: number
}

type textQuoteSelector = {
	type: string
	exact: string
	prefix?: string
	suffix?: string
}

type inputFormArgs = {
	element: HTMLElement,  // attach to this element
	name: string,          // name of the field
	id: string,            // id + 'Form' is used as a class attr and as id of input element
	value: string,         // initial value of input element
	onchange: string,      // name of handler
	type: string,          // usually '' but can be e.g. 'password'
	msg: string,           // help message for the field
}

// promisifed xhr
export function httpRequest(opts: httpOpts) {
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest()
		xhr.open(opts.method, opts.url)
		xhr.onload = function() {
			let r: httpResponse = {
				response: xhr.response,
				status: xhr.status,
				statusText: xhr.statusText,
				headers: parseResponseHeaders(xhr.getAllResponseHeaders())
			}
			if (this.status >= 200 && this.status < 300) {
				resolve(r)
			} else {
				console.log('http', opts.url, this.status)
				reject(r)
			}
		}
		xhr.onerror = function(e) {
			console.log('httpRequest', opts.url, this.status)
			reject({
				error: e,
				status: this.status,
				statusText: xhr.statusText
			})
		}
		if (opts.headers) {
			Object.keys(opts.headers).forEach(function(key) {
				xhr.setRequestHeader(key, opts.headers[key])
			})
		}
		xhr.send(opts.params)
	})
}

function _search(params: any, callback: any, offset: number, annos: object[], replies: object[], progressId?: string) {
	var max = 2000
	if (params.max) {
		max = params.max
	}

	var limit = 200
	if (max <= limit) {
		limit = max
	}

	if (progressId) {
		getById(progressId).innerHTML += '.'
	}

	var opts: httpOpts = {
		method: 'get',
		url: `https://hypothes.is/api/search?_separate_replies=true&limit=${limit}&offset=${offset}`,
		headers: {},
		params: {}
	}

	var facets = [ 'group', 'user', 'tag', 'url', 'any' ]

	facets.forEach(function(facet) {
		if (params[facet]) {
			var encodedValue = encodeURIComponent(params[facet])
			opts.url += `&${facet}=${encodedValue}`
		}
	})

	opts = setApiTokenHeaders(opts)

	httpRequest(opts).then(function(data) {
		let _data:any = data
		let response: any = JSON.parse(_data.response)
		annos = annos.concat(response.rows)
		replies = replies.concat(response.replies)
		if (response.rows.length === 0 || annos.length >= max) {
			callback(annos, replies)
		} else {
			_search(params, callback, offset + limit, annos, replies, progressId)
		}
	})
}

export function hApiSearch(params: any, callback: object, progressId?: string) {
	var offset = 0
	var annos: object[] = []
	var replies: object[] = []
	_search(params, callback, offset, annos, replies, progressId)
}

export function findRepliesForId(id: string, replies: any) {
	var _replies = replies.filter(function(x:any) { return x.references.indexOf(id) != -1	})
	return _replies.map(function(a:any) { return parseAnnotation(a)}).reverse() }

// organize a set of annotations, from https://hypothes.is/api/search, by url
export function gatherAnnotationsByUrl(rows: object[]) {
	var urls: any = {}
	var ids: any = {}
	var titles: any = {}
	var urlUpdates: any = {}
	var annos: any = {}
	for (var i = 0; i < rows.length; i++) {
		var row = rows[i]
		var annotation = parseAnnotation(row) // parse the annotation
		var id = annotation.id
		annos[id] = annotation // save it by id
		var url = annotation.url // remember these things
		url = url.replace(/\/$/, '') // strip trailing slash
		var updated = annotation.updated
		var title = annotation.title
		if (!title) title = url
		if (url in urls) {
			// add/update this url's info
			urls[url] += 1
			ids[url].push(id)
			if (updated > urlUpdates.url) urlUpdates[url] = updated
		} else {
			// init this url's info
			urls[url] = 1
			ids[url] = [ id ]
			titles[url] = title
			urlUpdates[url] = updated
		}
	}

	return {
		ids: ids,
		urlUpdates: urlUpdates,
		annos: annos,
		titles: titles,
		urls: urls
	}
}

export function parseAnnotation(row: any): annotation {
	var id = row.id
	var url = row.uri
	var updated = row.updated.slice(0, 19)
	var group = row.group
	var title = url
	var refs = row.references ? row.references : []
	var user = row.user.replace('acct:', '').replace('@hypothes.is', '')
	var quote = ''
	if (row.target && row.target.length) {
		var selectors = row.target[0].selector
		if (selectors) {
			for (var i = 0; i < selectors.length; i++) {
				let selector = selectors[i]
				if (selector.type === 'TextQuoteSelector') {
					quote = selector.exact
				}
			}
		}
	}
	var text = row.text ? row.text : ''

	var tags = row.tags

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

	var isReply = refs.length > 0

	var isPagenote = row.target && !row.target[0].hasOwnProperty('selector')

	let r: annotation = {
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
		tags: tags,
		group: group,
		target: row.target
	}

	return r
}

export function parseSelectors(target: any): object {
	var parsedSelectors: any = {}
	var firstTarget = target[0]
	if (firstTarget) {
		var selectors = firstTarget.selector
		if (selectors) {
			var textQuote = selectors.filter(function(x:any) { return x.type === 'TextQuoteSelector'} )
			if (textQuote.length) {
				parsedSelectors['TextQuote'] = {
					exact: textQuote[0].exact,
					prefix: textQuote[0].prefix,
					suffix: textQuote[0].suffix
				}
			}
			var textPosition = selectors.filter(function(x:any) { return x.type === 'TextPositionSelector' })
			if (textPosition.length) {
				parsedSelectors['TextPosition'] = {
					start: textPosition[0].start,
					end: textPosition[0].end
				}
			}
		}
	}
	return parsedSelectors
}

// get url parameters
export function gup(name: string, str?: string): string {
	if (!str) {
		str = window.location.href
	} else {
		str = '?' + str
	}
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]')
	var regexS = '[\\?&]' + name + '=([^&#]*)'
	var regex = new RegExp(regexS)
	var results = regex.exec(str)
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
	var a = document.createElement('a')
	a.href = url
	return a.hostname
}

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

export function getToken() {
	return getFromUrlParamOrLocalStorage('h_token')
}

export function getUser() {
	return getFromUrlParamOrLocalStorage('h_user')
}

export function getGroup() {
	var group = getFromUrlParamOrLocalStorage('h_group')
	return group != '' ? group : '__world__'
}

export function setToken() {
	setLocalStorageFromForm('tokenForm', 'h_token')
}

export function setUser() {
	setLocalStorageFromForm('userForm', 'h_user')
}

export function setGroup() {
	setLocalStorageFromForm('groupForm', 'h_group')
}

export function setLocalStorageFromForm(formId: string, storageKey: string) {
	var element = getById(formId) as HTMLInputElement
	localStorage.setItem(storageKey, element.value)
}

export function getFromUrlParamOrLocalStorage(key: string, _default?: string) {
	var value = gup(key)

	if (value === '') {
		let _value = localStorage.getItem(`${key}`)
		value = _value ? _value : '' 
	}

	if ((!value || value === '') && _default) {
		value = _default
	}

	if (!value) {
		value = ''
	}

	return value
}

export function createPermissions(username: string, group: string) {
	var permissions = {
		read: [ 'group:' + group ],
		update: [ 'acct:' + username + '@hypothes.is' ],
		delete: [ 'acct:' + username + '@hypothes.is' ]
	}
	return permissions
}

export function createTextQuoteSelector(exact: string, prefix: string, suffix: string): textQuoteSelector {
	let tqs: textQuoteSelector = {
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

export function createTextPositionSelector(start: number, end: number): textPositionSelector {
	let tps: textPositionSelector = {
		type: 'TextPositionSelector',
		start: start,
		end: end
	}
	return tps
}

/* 
Expects an object with these keys:
  uri: Target to which annotation will post
  exact, prefix, suffix: Info for TextQuoteSelector, only exact is required
  start, stop: Info for TextPositionSelector, optional
  username: Hypothesis username
  group: Hypothesis group (use '__world__' for Public)
  text: Body of annotation (could be markdown or html, whatever the Hypothesis editor supports)
  tags: Hypothesis tags
  extra: Extra data, invisible to user but available through H API
*/
export function createAnnotationPayload(params: any): string {
	//uri, exact, username, group, text, tags, extra){
	let textQuoteSelector
	let textPositionSelector

	if (params.exact) {
		// we have minimum info need for a TextQuoteSelector
		textQuoteSelector = createTextQuoteSelector(params.exact, params.prefix, params.suffix)
	}

	if (params.start && params.end) {
		textPositionSelector = createTextPositionSelector(params.start, params.end)
	}

	var target: any = {
		source: params.uri
	}

	if (textQuoteSelector) {
		// we have minimum info for an annotation target
		var selectors: object[] = [ textQuoteSelector ]
		if (textPositionSelector) {
			// we can also use TextPosition
			selectors.push(textPositionSelector)
		}
		target['selector'] = selectors
	}

	var payload: any = {
		uri: params.uri,
		group: params.group,
		permissions: createPermissions(params.username, params.group),
		text: params.text,
		document: {
			title: [ params.uri ]
		},
		tags: params.tags ? params.tags : []
	}

	if (target) {
		payload.target = [ target ]
	}

	if (params.extra) {
		payload.extra = params.extra
	}

	return JSON.stringify(payload)
}

export function postAnnotation(payload: string, token: string) {
	var url = 'https://hypothes.is/api/annotations'
	var opts: httpOpts = {
		method: 'post',
		params: payload,
		url: url,
		headers: {}
	}

	opts = setApiTokenHeaders(opts, token)

	return httpRequest(opts)
}

export function postAnnotationAndRedirect(payload: string, token: string, queryFragment?: string) {
	return postAnnotation(payload, token)
		.then((data) => {
			let _data:any = data
			let response:any = JSON.parse(_data.response)
			if (response.status != 200) {
				alert(`hlib status ${response.status}`)
				return
			}
			var url = response.uri
			if (queryFragment) {
				url += '#' + queryFragment
			}
			location.href = url
		})
		.catch((e) => {
			console.log(e)
		})
}

export function updateAnnotation(id: string, token: string, payload: string) {
	var url = `https://hypothes.is/api/annotations/${id}`
	var opts: httpOpts = {
		method: 'put',
		params: payload,
		url: url,
		headers: {}
	}
	opts = setApiTokenHeaders(opts, token)
	return httpRequest(opts)
}

export function deleteAnnotation(id: string, token: string) {
	var url = `https://hypothes.is/api/annotations/${id}`
	var opts: httpOpts = {
		method: 'delete',
		url: url,
		headers: {},
		params: {}
	}
	opts = setApiTokenHeaders(opts, token)
	return httpRequest(opts)
}

// input form for api token, remembered in local storage
export function createApiTokenInputForm(element: HTMLElement) {
	let tokenArgs:inputFormArgs = {
		element: element,
		name: 'Hypothesis API token',
		id: 'token',
		value: getToken(),
		onchange: 'hlib.setToken',
		type: 'password',
		msg: 'to write (or read private) annotations, copy/paste your <a href="https://hypothes.is/profile/developer">token</a>'
	}
	createNamedInputForm(tokenArgs)
}

// input form for username, remembered in local storage
export function createUserInputForm(element: HTMLElement) {
	let userArgs:inputFormArgs = {
		element: element,
		name: 'Hypothesis username',
		id: 'user',
		value: getUser(),
		onchange: 'hlib.setUser',
		type: '',
		msg: ''
	}
	createNamedInputForm(userArgs)
}

// create an input field with a handler to save,
// optionally a default value,
// optionally a type (e.g. password)
export function createNamedInputForm(args: inputFormArgs) {
	let { element, name, id, value, onchange, type, msg } = args
	let form = `
    <div class="formLabel">${name}</div>
    <div class="${id}Form"><input onchange="${onchange}()" value="${value}" type="${type}" id="${id}Form"></input></div>
		<div class="formMessage">${msg}</div>`
		element.innerHTML += form
		return element  // return value used for testing
}

// create a simple input field
export function createFacetInputForm(e: HTMLElement, facet: string, msg: string) {
	var form = `
    <div class="formLabel">${facet}</div>
    <div class="${facet}Form"><input id="${facet}Form"></input></div>
    <div class="formMessage">${msg}</div>`
	e.innerHTML += form
	return e // for testing
}

export function setSelectedGroup() {
	var selectedGroup = getSelectedGroup()
	localStorage.setItem('h_group', selectedGroup)
}

export function getSelectedGroup() {
	let selectedGroup
	let groupSelector = document.querySelector('#groupsList') as HTMLSelectElement
	if (getToken() && groupSelector) {
		var selectedGroupIndex = groupSelector.selectedIndex
		selectedGroup = groupSelector[selectedGroupIndex].value
	} else {
		selectedGroup = ''
	}
	return selectedGroup
}

export function createGroupInputForm(e: HTMLElement) {
	function createGroupSelector(groups: any) {
		var currentGroup = getGroup()
		var options = ''
		groups.forEach(function(g:any) {
			var selected = ''
			if (currentGroup == g.id) {
				selected = 'selected'
			}
			options += `<option ${selected} value="${g.id}">${g.name}</option>\n`
		})
		var selector = `
      <select onchange="hlib.setSelectedGroup()" id="groupsList">
      ${options}
      </select>`
		return selector
	}

	var token = getToken()

	var opts: httpOpts = {
		method: 'get',
		url: 'https://hypothes.is/api/profile',
		headers: {},
		params: {}
	}
	opts = setApiTokenHeaders(opts, token)
	httpRequest(opts)
		.then((data) => {
			let _data:any = data
			let response:any = JSON.parse(_data.response)
			var msg = ''
			if (!token) {
				msg = 'add token and refresh to see all groups here'
			}
			var form = `
        <div class="formLabel">Hypothesis Group</div>
        <div class="inputForm">${createGroupSelector(response.groups)}</div>
        <div class="formMessage">${msg}</div>`
			e.innerHTML += form
		})
		.catch((e) => {
			console.log(e)
		})
}

export function formatTags(tags: string[]): string {
	var formattedTags: string[] = []
	tags.forEach(function(tag) {
		var formattedTag = `<a target="_tag" href="./?tag=${tag}"><span class="annotationTag">${tag}</span></a>`
		formattedTags.push(formattedTag)
	})
	return formattedTags.join(' ')
}

export function csvRow(level: number, anno: any): string {
	var fields = [
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
	fields.push(`https://hyp.is/${anno.id}`) // add direct link
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

export function showAnnotation(anno: annotation, level: number) {
	var dt = new Date(anno.updated)
	var dt_str = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString().replace(/:\d{2}\s/, ' ')

	var html = anno.text == null ? '' : anno.text
	var converter = new Showdown.converter()
	html = converter.makeHtml(html)

	var tags = ''
	if (anno.tags.length) {
		tags = formatTags(anno.tags)
	}

	var user = anno.user.replace('acct:', '').replace('@hypothes.is', '')

	var quote = anno.quote

	if (anno.quote) {
		quote = `<div class="annotationQuote">${anno.quote}</div>`
	}

	var standaloneAnnotationUrl = `https://hypothes.is/a/${anno.id}`

	var marginLeft = level * 20

	var groupSlug = 'in Public'
	if (anno.group !== '__world__') {
		groupSlug = `
      in group
      <span class="groupid"><a title="search group" target="_group" href="./?group=${anno.group}">${anno.group}</a>
      </span>`
	}

	var output = `
    <div class="annotationCard" style="display:block; margin-left:${marginLeft}px;">
      <div class="csvRow">${csvRow(level, anno)}</div>
      <div class="annotationHeader">
        <span class="user">
        <a title="search user" target="_user"  href="./?user=${user}">${user}</a>
        </span>
      <span class="timestamp"><a title="view/edit/reply"  target="_standalone"
        href="${standaloneAnnotationUrl}">${dt_str}</a>
      </span>
      ${groupSlug}
      </div>
      <div class="annotationBody">
        ${quote}
        <div>${html}</div>
        <div class="annotationTags">${tags}</div>
      </div>
    </div>`
	return output
}

export function download(text: string, type: string) {
	var blob = new Blob([ text ], {
		type: 'application/octet-stream'
	})
	var url = URL.createObjectURL(blob)
	var a = document.createElement('a')
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
	var headers: any = {}
	if (!headerStr) {
		return headers
	}
	var headerPairs = headerStr.split('\u000d\u000a')
	for (var i = 0; i < headerPairs.length; i++) {
		var headerPair = headerPairs[i]
		// Can't use split() here because it does the wrong thing
		// if the header value has the string ": " in it.
		var index = headerPair.indexOf('\u003a\u0020')
		if (index > 0) {
			var key = headerPair.substring(0, index)
			var val = headerPair.substring(index + 2)
			headers[key] = val
		}
	}
	return headers
}

// functions used by the facet tool

export function collapseAll() {
	var togglers: NodeListOf<HTMLElement> = document.querySelectorAll('.urlHeading .toggle')
	togglers.forEach(function(toggler) {
		setToggleControlCollapse(toggler)
	})
	var cards: NodeListOf<HTMLElement> = document.querySelectorAll('.annotationCard')
	hideCards(cards)
}

export function expandAll() {
	var togglers: NodeListOf<HTMLElement> = document.querySelectorAll('.urlHeading .toggle')
	togglers.forEach((toggler) => {
		setToggleControlExpand(toggler)
	})
	var cards: NodeListOf<HTMLElement> = document.querySelectorAll('.annotationCard')
	showCards(cards)
}

export function setToggleControlCollapse(toggler: HTMLElement) {
	toggler.innerHTML = '\u{25b6}'
	toggler.title = 'expand'
}

export function setToggleControlExpand(toggler: HTMLElement) {
	toggler.innerHTML = '\u{25bc}'
	toggler.title = 'collapse'
}

export function showCards(cards: NodeListOf<HTMLElement>) {
	for (var i = 0; i < cards.length; i++) {
		cards[i].style.display = 'block'
	}
}

export function hideCards(cards: NodeListOf<HTMLElement>) {
	for (var i = 0; i < cards.length; i++) {
		cards[i].style.display = 'none'
	}
}

export function toggle(id: string) {
	var heading = getById('heading_' + id)
	var toggler = heading.querySelector('.toggle') as HTMLElement

	var cardsId = `cards_${id}`
	var selector = `#${cardsId} .annotationCard`
	var perUrlCards: NodeListOf<HTMLElement> = document.querySelectorAll(selector)
	var cardsDisplay = perUrlCards[0].style.display

	if (cardsDisplay === 'block') {
		setToggleControlCollapse(toggler)
		hideCards(perUrlCards)
	} else {
		setToggleControlExpand(toggler)
		showCards(perUrlCards)
	}
}
