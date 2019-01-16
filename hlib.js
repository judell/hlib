var settings = {
    service: 'https://hypothes.is'
};
export function getSettings() {
    return settings;
}
export function updateSettings(newSettings) {
    settings = Object.assign(newSettings);
}
/** Promisified XMLHttpRequest
 *  This predated fetch() and now wraps it.
 * */
export function httpRequest(opts) {
    return new Promise((resolve, reject) => {
        let input = new Request(opts.url);
        let init = {
            method: opts.method,
            headers: opts.headers
        };
        let method = opts.method.toLowerCase();
        if (method !== 'get' && method !== 'head') {
            init.body = opts.params;
        }
        fetch(input, init)
            .then(fetchResponse => {
            return fetchResponse.text();
        })
            .then(text => {
            resolve({ response: text });
        })
            .catch(reason => {
            console.error('rejected', opts, reason);
            reject(reason);
        });
    });
}
/** Wrapper for `/api/search` (deprecated in favor of `search(params, progressId)`)*/
export function hApiSearch(params, callback, progressId) {
    function _search(params, after, callback, annos, replies, progressId) {
        let max = 2000;
        if (params.max) {
            max = params.max;
        }
        let limit = 200;
        if (max <= limit) {
            limit = max;
        }
        if (progressId) {
            getById(progressId).innerHTML += '.';
        }
        let afterClause = after ? `&search_after=${after}` : '';
        let opts = {
            method: 'get',
            url: `${settings.service}/api/search?_separate_replies=true&limit=${limit}${afterClause}`,
            headers: {},
            params: {}
        };
        let facets = ['group', 'user', 'tag', 'url', 'wildcard_uri', 'any'];
        facets.forEach(function (facet) {
            if (params[facet]) {
                var encodedValue = encodeURIComponent(params[facet]);
                opts.url += `&${facet}=${encodedValue}`;
            }
        });
        opts = setApiTokenHeaders(opts);
        httpRequest(opts).then(function (data) {
            let response = JSON.parse(data.response);
            annos = annos.concat(response.rows);
            replies = replies.concat(response.replies);
            if (response.rows.length === 0 || annos.length >= max) {
                callback(annos, replies);
            }
            else {
                let sentinel = response.rows.slice(-1)[0].updated;
                _search(params, sentinel, callback, annos, replies, progressId);
            }
        });
    }
    let annos = [];
    let replies = [];
    let after = '';
    _search(params, after, callback, annos, replies, progressId);
}
/** Wrapper for `/api/search` */
export function search(params, progressId) {
    function _search(params, after, annos, replies, progressId) {
        return new Promise((resolve, reject) => {
            let max = 2000;
            if (params.max) {
                max = params.max;
            }
            let limit = 200;
            if (max <= limit) {
                limit = max;
            }
            if (progressId) {
                getById(progressId).innerHTML += '.';
            }
            let separateReplies = params._separate_replies === 'true' ? '&_separate_replies=true' : '';
            let afterClause = after ? `&search_after=${after}` : '';
            let opts = {
                method: 'get',
                url: `${settings.service}/api/search?limit=${limit}${separateReplies}${afterClause}`,
                headers: {},
                params: {}
            };
            console.log(opts);
            let facets = ['group', 'user', 'tag', 'url', 'wildcard_uri', 'any'];
            facets.forEach(function (facet) {
                if (params[facet]) {
                    var encodedValue = encodeURIComponent(params[facet]);
                    opts.url += `&${facet}=${encodedValue}`;
                }
            });
            opts = setApiTokenHeaders(opts);
            httpRequest(opts)
                .then(function (data) {
                let response = JSON.parse(data.response);
                annos = annos.concat(response.rows);
                if (response.replies) {
                    replies = replies.concat(response.replies);
                }
                if (response.rows.length === 0 || annos.length >= max) {
                    let result = [annos, replies];
                    console.log('hlib http response', result);
                    resolve(result);
                }
                else {
                    let sentinel = response.rows.slice(-1)[0].updated;
                    resolve(_search(params, sentinel, annos, replies, progressId));
                }
            })
                .catch(reason => {
                reject(reason);
            });
        });
    }
    return new Promise(resolve => {
        let annos = [];
        let replies = [];
        let after = '';
        resolve(_search(params, after, annos, replies, progressId));
    });
}
/** The replies param is a set of rows returned from `/api/search?_separate_replies=true`,
 * this function reduces the set to just replies to the given id
 */
export function findRepliesForId(id, replies) {
    var _replies = replies.filter(_reply => {
        return _reply.references.indexOf(id) != -1;
    });
    return _replies;
}
export function showThread(row, level, replies, displayed, displayElement) {
    if (displayed.indexOf(row.id) != -1) {
        return;
    }
    else {
        displayed.push(row.id);
        let _replies = findRepliesForId(row.id, replies);
        let anno = parseAnnotation(row);
        displayElement.innerHTML += showAnnotation(anno, level);
        _replies.forEach(_reply => {
            showThread(_reply, level + 1, _replies, displayed, displayElement);
        });
    }
}
/** Organize a set of annotations, from ${settings.service}/api/search, by url */
export function gatherAnnotationsByUrl(rows) {
    var urls = {};
    var ids = {};
    var titles = {};
    var urlUpdates = {};
    var annos = {};
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var annotation = parseAnnotation(row); // parse the annotation
        var id = annotation.id;
        annos[id] = annotation; // save it by id
        var url = annotation.url; // remember these things
        url = url.replace(/\/$/, ''); // strip trailing slash
        var updated = annotation.updated;
        var title = annotation.title;
        if (!title)
            title = url;
        if (url in urls) {
            // add/update this url's info
            urls[url] += 1;
            ids[url].push(id);
            if (updated > urlUpdates.url)
                urlUpdates[url] = updated;
        }
        else {
            // init this url's info
            urls[url] = 1;
            ids[url] = [id];
            titles[url] = title;
            urlUpdates[url] = updated;
        }
    }
    return {
        ids: ids,
        urlUpdates: urlUpdates,
        annos: annos,
        titles: titles,
        urls: urls
    };
}
/** Parse a row returned from `/api/search` */
export function parseAnnotation(row) {
    var id = row.id;
    var url = row.uri;
    var updated = row.updated.slice(0, 19);
    var group = row.group;
    var title = url;
    var refs = row.references ? row.references : [];
    var user = row.user.replace('acct:', '').replace('@hypothes.is', '');
    var quote = '';
    if (row.target && row.target.length) {
        var selectors = row.target[0].selector;
        if (selectors) {
            for (var i = 0; i < selectors.length; i++) {
                let selector = selectors[i];
                if (selector.type === 'TextQuoteSelector') {
                    quote = selector.exact;
                }
            }
        }
    }
    var text = row.text ? row.text : '';
    var tags = row.tags;
    try {
        title = row.document.title;
        if (typeof title === 'object') {
            title = title[0];
        }
        else {
            title = url;
        }
    }
    catch (e) {
        title = url;
    }
    var isReply = refs.length > 0;
    var isPagenote = row.target && !row.target[0].hasOwnProperty('selector');
    let r = {
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
    };
    return r;
}
/** Parse the `target` of a row returned from `/api/search` */
export function parseSelectors(target) {
    var parsedSelectors = {};
    var firstTarget = target[0];
    if (firstTarget) {
        var selectors = firstTarget.selector;
        if (selectors) {
            var textQuote = selectors.filter(function (x) {
                return x.type === 'TextQuoteSelector';
            });
            if (textQuote.length) {
                parsedSelectors['TextQuote'] = {
                    exact: textQuote[0].exact,
                    prefix: textQuote[0].prefix,
                    suffix: textQuote[0].suffix
                };
            }
            var textPosition = selectors.filter(function (x) {
                return x.type === 'TextPositionSelector';
            });
            if (textPosition.length) {
                parsedSelectors['TextPosition'] = {
                    start: textPosition[0].start,
                    end: textPosition[0].end
                };
            }
        }
    }
    return parsedSelectors;
}
/** Get url parameters */
export function gup(name, str) {
    if (!str) {
        str = window.location.href;
    }
    else {
        str = '?' + str;
    }
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regexS = '[\\?&]' + name + '=([^&#]*)';
    var regex = new RegExp(regexS);
    var results = regex.exec(str);
    if (results == null) {
        return '';
    }
    else {
        return results[1];
    }
}
export function getById(id) {
    return document.getElementById(id);
}
export function appendBody(element) {
    document.body.appendChild(element);
}
export function getDomainFromUrl(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.hostname;
}
/** Add a token authorization header to the options that govern an `httpRequest`.
 * If the token isn't passed as a param, try getting it from local storage.
*/
export function setApiTokenHeaders(opts, token) {
    if (!token) {
        token = getToken();
    }
    if (token) {
        opts.headers = {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json;charset=utf-8'
        };
    }
    return opts;
}
/** Acquire a Hypothesis API token */
export function getToken() {
    return getFromUrlParamOrLocalStorage('h_token');
}
/** Acquire a Hypothesis username */
export function getUser() {
    return getFromUrlParamOrLocalStorage('h_user');
}
/** Acquire a Hypothesis group id */
export function getGroup() {
    var group = getFromUrlParamOrLocalStorage('h_group');
    return group != '' ? group : '__world__';
}
/** Save a Hypothesis API token. */
export function setToken() {
    setLocalStorageFromForm('tokenForm', 'h_token');
}
/** Save a Hypothesis username. */
export function setUser() {
    setLocalStorageFromForm('userForm', 'h_user');
}
/** Save a Hypothesis group id */
export function setGroup() {
    setLocalStorageFromForm('groupForm', 'h_group');
}
/** Save value of a form field. */
export function setLocalStorageFromForm(formId, storageKey) {
    var element = getById(formId);
    localStorage.setItem(storageKey, element.value);
}
/** Get a value passed as an url paramater, or from local storage. */
export function getFromUrlParamOrLocalStorage(key, _default) {
    var value = gup(key);
    if (value === '') {
        let _value = localStorage.getItem(`${key}`);
        value = _value ? _value : '';
    }
    if ((!value || value === '') && _default) {
        value = _default;
    }
    if (!value) {
        value = '';
    }
    return value;
}
/** Helper for `createAnnotationPayload`.  */
export function createPermissions(username, group) {
    var permissions = {
        read: ['group:' + group],
        update: ['acct:' + username + '@hypothes.is'],
        delete: ['acct:' + username + '@hypothes.is']
    };
    return permissions;
}
/** Helper for `createAnnotationPayload` */
export function createTextQuoteSelector(exact, prefix, suffix) {
    let tqs = {
        type: 'TextQuoteSelector',
        exact: exact,
        prefix: '',
        suffix: ''
    };
    if (prefix) {
        tqs.prefix = prefix;
    }
    if (suffix) {
        tqs.suffix = suffix;
    }
    return tqs;
}
/** Helper for `createAnnotationPayload` */
export function createTextPositionSelector(start, end) {
    let tps = {
        type: 'TextPositionSelector',
        start: start,
        end: end
    };
    return tps;
}
/** Form the JSON payload that creates an annotation.
 *
 * Expects an object with these keys:
 * ```
 * uri: Target to which annotation will post
 * exact, prefix, suffix: Info for TextQuoteSelector, only exact is required
 * start, stop: Info for TextPositionSelector, optional
 * username: Hypothesis username
 * group: Hypothesis group (use `__world__` for Public)
 * text: Body of annotation (could be markdown or html)
 * tags: Hypothesis tags
 * extra: Extra data, invisible to user but available through H API
 * ```
 */
export function createAnnotationPayload(params) {
    //uri, exact, username, group, text, tags, extra){
    let textQuoteSelector;
    let textPositionSelector;
    if (params.exact) {
        // we have minimum info need for a TextQuoteSelector
        textQuoteSelector = createTextQuoteSelector(params.exact, params.prefix, params.suffix);
    }
    if (params.start && params.end) {
        textPositionSelector = createTextPositionSelector(params.start, params.end);
    }
    var target = {
        source: params.uri
    };
    if (textQuoteSelector) {
        // we have minimum info for an annotation target
        var selectors = [textQuoteSelector];
        if (textPositionSelector) {
            // we can also use TextPosition
            selectors.push(textPositionSelector);
        }
        target['selector'] = selectors;
    }
    var payload = {
        uri: params.uri,
        group: params.group,
        permissions: createPermissions(params.username, params.group),
        text: params.text,
        document: {
            title: [params.uri]
        },
        tags: params.tags ? params.tags : []
    };
    if (target) {
        payload.target = [target];
    }
    if (params.extra) {
        payload.extra = params.extra;
    }
    return JSON.stringify(payload);
}
/** Create an annotation */
export function postAnnotation(payload, token) {
    var url = `${settings.service}/api/annotations`;
    var opts = {
        method: 'post',
        params: payload,
        url: url,
        headers: {}
    };
    opts = setApiTokenHeaders(opts, token);
    return httpRequest(opts);
}
/** Create an annotation and redirect to the annotated page,
 * optionally with a client-side query.
 */
export function postAnnotationAndRedirect(payload, token, queryFragment) {
    return postAnnotation(payload, token)
        .then(data => {
        let _data = data;
        let status = _data.status;
        if (status != 200) {
            alert(`hlib status ${status}`);
            return;
        }
        let response = JSON.parse(_data.response);
        var url = response.uri;
        if (queryFragment) {
            url += '#' + queryFragment;
        }
        location.href = url;
    })
        .catch((e) => {
        console.log(e);
    });
}
export function updateAnnotation(id, token, payload) {
    var url = `${settings.service}/api/annotations/${id}`;
    var opts = {
        method: 'put',
        params: payload,
        url: url,
        headers: {}
    };
    opts = setApiTokenHeaders(opts, token);
    return httpRequest(opts);
}
export function deleteAnnotation(id, token) {
    var url = `${settings.service}/api/annotations/${id}`;
    var opts = {
        method: 'delete',
        url: url,
        headers: {},
        params: {}
    };
    opts = setApiTokenHeaders(opts, token);
    return httpRequest(opts);
}
/** Input form for an API token, remembered in local storage. */
export function createApiTokenInputForm(element) {
    let tokenArgs = {
        element: element,
        name: 'Hypothesis API token',
        id: 'token',
        value: getToken(),
        onchange: 'hlib.setToken',
        type: 'password',
        msg: `to write (or read private) annotations, copy/paste your <a target="_token" href="${settings.service}/profile/developer">token</a>`
    };
    createNamedInputForm(tokenArgs);
}
/** Input form for a username, remembered in local storage. */
export function createUserInputForm(element, msg) {
    let userArgs = {
        element: element,
        name: 'Hypothesis username',
        id: 'user',
        value: getUser(),
        onchange: 'hlib.setUser',
        type: '',
        msg: msg ? msg : ''
    };
    createNamedInputForm(userArgs);
}
/** Create an input field with a handler to save the changed value,
 *  optionally with a default value, optionally with a type (e.g. password).
 *  Should be rnamed to createPersistentInputForm.
 */
export function createNamedInputForm(args) {
    let { element, name, id, value, onchange, type, msg } = args;
    let form = `
    <div class="formLabel">${name}</div>
    <div class="${id}Form"><input onchange="${onchange}()" value="${value}" type="${type}" id="${id}Form"></input></div>
    <div class="formMessage">${msg}</div>`;
    element.innerHTML += form;
    return element; // return value used for testing
}
/** Create a simple input field. */
export function createFacetInputForm(e, facet, msg, value) {
    if (!value) {
        value = '';
    }
    var form = `
    <div class="formLabel">${facet}</div>
    <div class="${facet}Form"><input value="${value}" id="${facet}Form"></input></div>
    <div class="formMessage">${msg}</div>`;
    e.innerHTML += form;
    return e; // for testing
}
export function setSelectedGroup() {
    var selectedGroup = getSelectedGroup();
    localStorage.setItem('h_group', selectedGroup);
}
export function getSelectedGroup(selectId) {
    let _selector = selectId ? selectId : 'groupsList';
    _selector = '#' + _selector;
    let groupSelector = document.querySelector(_selector);
    let options = groupSelector.options;
    let selectedGroup = options[options.selectedIndex].value;
    return selectedGroup;
}
/** Create a Hypothesis group picker. */
export function createGroupInputForm(e, selectId) {
    let _selectId = selectId ? selectId : 'groupsList';
    function createGroupSelector(groups, selectId) {
        var currentGroup = getGroup();
        var options = '';
        groups.forEach(function (g) {
            var selected = '';
            if (currentGroup == g.id) {
                selected = 'selected';
            }
            options += `<option ${selected} value="${g.id}">${g.name}</option>\n`;
        });
        var selector = `
      <select onchange="hlib.setSelectedGroup()" id="${_selectId}">
      ${options}
      </select>`;
        return selector;
    }
    var token = getToken();
    var opts = {
        method: 'get',
        url: `${settings.service}/api/profile`,
        headers: {},
        params: {}
    };
    opts = setApiTokenHeaders(opts, token);
    httpRequest(opts)
        .then((data) => {
        let response = JSON.parse(data.response);
        var msg = '';
        if (!token) {
            msg = 'add token and <a href="javascript:location.href=location.href">refresh</a> to see all groups here';
        }
        var form = `
        <div class="formLabel">Hypothesis Group</div>
        <div class="inputForm">${createGroupSelector(response.groups, _selectId)}</div>
        <div class="formMessage">${msg}</div>`;
        e.innerHTML += form;
    })
        .catch((e) => {
        console.error(e);
    });
}
/** Render a list of tags. By default, the links work as in ${settings.service}judell/facet.
 * Use the optional `urlPrefix` with `${settings.service}/search?q=tag:` to override
 * with links to the Hypothesis viewer.
 */
export function formatTags(tags, urlPrefix) {
    var formattedTags = [];
    tags.forEach(function (tag) {
        let url = urlPrefix ? urlPrefix + tag : `./?tag=${tag}`;
        var formattedTag = `<a target="_tag" href="${url}"><span class="annotationTag">${tag}</span></a>`;
        formattedTags.push(formattedTag);
    });
    return formattedTags.join(' ');
}
/** Format an annotation as a row of a CSV export. */
export function csvRow(level, anno) {
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
    ];
    fields.push(`https://hyp.is/${anno.id}`); // add direct link
    fields = fields.map(function (field) {
        if (field) {
            field = field.replace(/&/g, '&amp;'); // the resulting text will be added as html to the dom
            field = field.replace(/</g, '&lt;');
            field = field.replace(/\s+/g, ' '); // normalize whitespace
            field = field.replace(/"/g, '""'); // escape double quotes
            field = field.replace(/\r?\n|\r/g, ' '); // remove cr lf
            field = `"${field}"`; // quote the field
        }
        return field;
    });
    return fields.join(',');
}
//var Showdown:any = {} // Placeholder to silence TypeScript 'cannot find name' complaint
/** Render an annotation card. */
export function showAnnotation(anno, level, tagUrlPrefix) {
    var dt = new Date(anno.updated);
    var dt_str = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString().replace(/:\d{2}\s/, ' ');
    var html = anno.text == null ? '' : anno.text;
    var converter = new Showdown.converter();
    html = converter.makeHtml(html);
    var tags = '';
    if (anno.tags.length) {
        tags = formatTags(anno.tags, tagUrlPrefix);
    }
    var user = anno.user.replace('acct:', '').replace('@hypothes.is', '');
    var quote = anno.quote;
    if (anno.quote) {
        quote = `<div class="annotationQuote">${anno.quote}</div>`;
    }
    var standaloneAnnotationUrl = `${settings.service}/a/${anno.id}`;
    var marginLeft = level * 20;
    var groupSlug = 'in Public';
    if (anno.group !== '__world__') {
        groupSlug = `
      in group
      <span class="groupid"><a title="search group" target="_group" href="./?group=${anno.group}">${anno.group}</a>
      </span>`;
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
      <hr class="annotationCardDivider">
    </div>`;
    return output;
}
/** Save exported annotations to a file. */
export function download(text, type) {
    var blob = new Blob([text], {
        type: 'application/octet-stream'
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = 'hypothesis.' + type;
    document.body.appendChild(a);
    a.click();
}
// https://gist.github.com/monsur/706839
/**
 * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
 * headers according to the format described here:
 * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
 * This method parses that string into a user-friendly key/value pair object.
 */
export function parseResponseHeaders(headerStr) {
    var headers = {};
    if (!headerStr) {
        return headers;
    }
    var headerPairs = headerStr.split('\u000d\u000a');
    for (var i = 0; i < headerPairs.length; i++) {
        var headerPair = headerPairs[i];
        // Can't use split() here because it does the wrong thing
        // if the header value has the string ": " in it.
        var index = headerPair.indexOf('\u003a\u0020');
        if (index > 0) {
            var key = headerPair.substring(0, index);
            var val = headerPair.substring(index + 2);
            headers[key] = val;
        }
    }
    return headers;
}
// functions used by the facet tool
/** Collapse all annotation cards. */
export function collapseAll() {
    var togglers = document.querySelectorAll('.urlHeading .toggle');
    togglers.forEach(function (toggler) {
        setToggleControlCollapse(toggler);
    });
    var cards = document.querySelectorAll('.annotationCard');
    hideCards(cards);
}
/** Expand all annotation cards. */
export function expandAll() {
    var togglers = document.querySelectorAll('.urlHeading .toggle');
    togglers.forEach((toggler) => {
        setToggleControlExpand(toggler);
    });
    var cards = document.querySelectorAll('.annotationCard');
    showCards(cards);
}
/** Set expand/collapse toggle to collapsed. */
export function setToggleControlCollapse(toggler) {
    toggler.innerHTML = '\u{25b6}';
    toggler.title = 'expand';
}
/** Set expand/collapse toggle to expanded. */
export function setToggleControlExpand(toggler) {
    toggler.innerHTML = '\u{25bc}';
    toggler.title = 'collapse';
}
/** Show a setof annotation cards. */
export function showCards(cards) {
    for (var i = 0; i < cards.length; i++) {
        cards[i].style.display = 'block';
    }
}
/** Hide a set of annotation cards. */
export function hideCards(cards) {
    for (var i = 0; i < cards.length; i++) {
        cards[i].style.display = 'none';
    }
}
/** Switch the expand/collapse state of an annotation card. */
export function toggle(id) {
    var heading = getById('heading_' + id);
    var toggler = heading.querySelector('.toggle');
    var cardsId = `cards_${id}`;
    var selector = `#${cardsId} .annotationCard`;
    var perUrlCards = document.querySelectorAll(selector);
    var cardsDisplay = perUrlCards[0].style.display;
    if (cardsDisplay === 'block') {
        setToggleControlCollapse(toggler);
        hideCards(perUrlCards);
    }
    else {
        setToggleControlExpand(toggler);
        showCards(perUrlCards);
    }
}
