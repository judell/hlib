"use strict";
exports.__esModule = true;
// promisifed xhr
function httpRequest(opts) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(opts.method, opts.url);
        xhr.onload = function () {
            var r = {
                response: xhr.response,
                status: xhr.status,
                statusText: xhr.statusText,
                headers: parseResponseHeaders(xhr.getAllResponseHeaders())
            };
            if (this.status >= 200 && this.status < 300) {
                resolve(r);
            }
            else {
                console.log('http', opts.url, this.status);
                reject(r);
            }
        };
        xhr.onerror = function (e) {
            console.log('httpRequest', opts.url, this.status);
            reject({
                error: e,
                status: this.status,
                statusText: xhr.statusText
            });
        };
        if (opts.headers) {
            Object.keys(opts.headers).forEach(function (key) {
                xhr.setRequestHeader(key, opts.headers[key]);
            });
        }
        xhr.send(opts.params);
    });
}
exports.httpRequest = httpRequest;
function _search(params, callback, offset, annos, replies, progressId) {
    var max = 2000;
    if (params.max) {
        max = params.max;
    }
    var limit = 200;
    if (max <= limit) {
        limit = max;
    }
    if (progressId) {
        getById(progressId).innerHTML += '.';
    }
    var opts = {
        method: 'get',
        url: "https://hypothes.is/api/search?_separate_replies=true&limit=" + limit + "&offset=" + offset,
        headers: {},
        params: {}
    };
    var facets = ['group', 'user', 'tag', 'url', 'any'];
    facets.forEach(function (facet) {
        if (params[facet]) {
            var encodedValue = encodeURIComponent(params[facet]);
            opts.url += "&" + facet + "=" + encodedValue;
        }
    });
    opts = setApiTokenHeaders(opts);
    httpRequest(opts).then(function (data) {
        var _data = data;
        var response = JSON.parse(_data.response);
        annos = annos.concat(response.rows);
        replies = replies.concat(response.replies);
        if (response.rows.length === 0 || annos.length >= max) {
            callback(annos, replies);
        }
        else {
            _search(params, callback, offset + limit, annos, replies, progressId);
        }
    });
}
function hApiSearch(params, callback, progressId) {
    var offset = 0;
    var annos = [];
    var replies = [];
    _search(params, callback, offset, annos, replies, progressId);
}
exports.hApiSearch = hApiSearch;
function findRepliesForId(id, replies) {
    var _replies = replies.filter(function (x) {
        return x.references.indexOf(id) != -1;
    });
    return _replies
        .map(function (a) {
        return parseAnnotation(a);
    })
        .reverse();
}
exports.findRepliesForId = findRepliesForId;
// organize a set of annotations, from https://hypothes.is/api/search, by url
function gatherAnnotationsByUrl(rows) {
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
exports.gatherAnnotationsByUrl = gatherAnnotationsByUrl;
function parseAnnotation(row) {
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
                var selector = selectors[i];
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
    var r = {
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
exports.parseAnnotation = parseAnnotation;
function parseSelectors(target) {
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
exports.parseSelectors = parseSelectors;
// get url parameters
function gup(name, str) {
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
exports.gup = gup;
function getById(id) {
    return document.getElementById(id);
}
exports.getById = getById;
function appendBody(element) {
    document.body.appendChild(element);
}
exports.appendBody = appendBody;
function getDomainFromUrl(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.hostname;
}
exports.getDomainFromUrl = getDomainFromUrl;
function setApiTokenHeaders(opts, token) {
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
exports.setApiTokenHeaders = setApiTokenHeaders;
function getToken() {
    return getFromUrlParamOrLocalStorage('h_token');
}
exports.getToken = getToken;
function getUser() {
    return getFromUrlParamOrLocalStorage('h_user');
}
exports.getUser = getUser;
function getGroup() {
    var group = getFromUrlParamOrLocalStorage('h_group');
    return group != '' ? group : '__world__';
}
exports.getGroup = getGroup;
function setToken() {
    setLocalStorageFromForm('tokenForm', 'h_token');
}
exports.setToken = setToken;
function setUser() {
    setLocalStorageFromForm('userForm', 'h_user');
}
exports.setUser = setUser;
function setGroup() {
    setLocalStorageFromForm('groupForm', 'h_group');
}
exports.setGroup = setGroup;
function setLocalStorageFromForm(formId, storageKey) {
    var element = getById(formId);
    localStorage.setItem(storageKey, element.value);
}
exports.setLocalStorageFromForm = setLocalStorageFromForm;
function getFromUrlParamOrLocalStorage(key, _default) {
    var value = gup(key);
    if (value === '') {
        var _value = localStorage.getItem("" + key);
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
exports.getFromUrlParamOrLocalStorage = getFromUrlParamOrLocalStorage;
function createPermissions(username, group) {
    var permissions = {
        read: ['group:' + group],
        update: ['acct:' + username + '@hypothes.is'],
        "delete": ['acct:' + username + '@hypothes.is']
    };
    return permissions;
}
exports.createPermissions = createPermissions;
function createTextQuoteSelector(exact, prefix, suffix) {
    var tqs = {
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
exports.createTextQuoteSelector = createTextQuoteSelector;
function createTextPositionSelector(start, end) {
    var tps = {
        type: 'TextPositionSelector',
        start: start,
        end: end
    };
    return tps;
}
exports.createTextPositionSelector = createTextPositionSelector;
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
function createAnnotationPayload(params) {
    //uri, exact, username, group, text, tags, extra){
    var textQuoteSelector;
    var textPositionSelector;
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
exports.createAnnotationPayload = createAnnotationPayload;
function postAnnotation(payload, token) {
    var url = 'https://hypothes.is/api/annotations';
    var opts = {
        method: 'post',
        params: payload,
        url: url,
        headers: {}
    };
    opts = setApiTokenHeaders(opts, token);
    return httpRequest(opts);
}
exports.postAnnotation = postAnnotation;
function postAnnotationAndRedirect(payload, token, queryFragment) {
    return postAnnotation(payload, token)
        .then(function (data) {
        var _data = data;
        var status = _data.status;
        if (status != 200) {
            alert("hlib status " + status);
            return;
        }
        var response = JSON.parse(_data.response);
        var url = response.uri;
        if (queryFragment) {
            url += '#' + queryFragment;
        }
        location.href = url;
    })["catch"](function (e) {
        console.log(e);
    });
}
exports.postAnnotationAndRedirect = postAnnotationAndRedirect;
function updateAnnotation(id, token, payload) {
    var url = "https://hypothes.is/api/annotations/" + id;
    var opts = {
        method: 'put',
        params: payload,
        url: url,
        headers: {}
    };
    opts = setApiTokenHeaders(opts, token);
    return httpRequest(opts);
}
exports.updateAnnotation = updateAnnotation;
function deleteAnnotation(id, token) {
    var url = "https://hypothes.is/api/annotations/" + id;
    var opts = {
        method: 'delete',
        url: url,
        headers: {},
        params: {}
    };
    opts = setApiTokenHeaders(opts, token);
    return httpRequest(opts);
}
exports.deleteAnnotation = deleteAnnotation;
// input form for api token, remembered in local storage
function createApiTokenInputForm(element) {
    var tokenArgs = {
        element: element,
        name: 'Hypothesis API token',
        id: 'token',
        value: getToken(),
        onchange: 'hlib.setToken',
        type: 'password',
        msg: 'to write (or read private) annotations, copy/paste your <a href="https://hypothes.is/profile/developer">token</a>'
    };
    createNamedInputForm(tokenArgs);
}
exports.createApiTokenInputForm = createApiTokenInputForm;
// input form for username, remembered in local storage
function createUserInputForm(element) {
    var userArgs = {
        element: element,
        name: 'Hypothesis username',
        id: 'user',
        value: getUser(),
        onchange: 'hlib.setUser',
        type: '',
        msg: ''
    };
    createNamedInputForm(userArgs);
}
exports.createUserInputForm = createUserInputForm;
// create an input field with a handler to save,
// optionally a default value,
// optionally a type (e.g. password)
function createNamedInputForm(args) {
    var element = args.element, name = args.name, id = args.id, value = args.value, onchange = args.onchange, type = args.type, msg = args.msg;
    var form = "\n    <div class=\"formLabel\">" + name + "</div>\n    <div class=\"" + id + "Form\"><input onchange=\"" + onchange + "()\" value=\"" + value + "\" type=\"" + type + "\" id=\"" + id + "Form\"></input></div>\n    <div class=\"formMessage\">" + msg + "</div>";
    element.innerHTML += form;
    return element; // return value used for testing
}
exports.createNamedInputForm = createNamedInputForm;
// create a simple input field
function createFacetInputForm(e, facet, msg) {
    var form = "\n    <div class=\"formLabel\">" + facet + "</div>\n    <div class=\"" + facet + "Form\"><input id=\"" + facet + "Form\"></input></div>\n    <div class=\"formMessage\">" + msg + "</div>";
    e.innerHTML += form;
    return e; // for testing
}
exports.createFacetInputForm = createFacetInputForm;
function setSelectedGroup() {
    var selectedGroup = getSelectedGroup();
    localStorage.setItem('h_group', selectedGroup);
}
exports.setSelectedGroup = setSelectedGroup;
function getSelectedGroup(selectId) {
    var _selector = selectId ? selectId : 'groupsList';
    _selector = '#' + _selector;
    var groupSelector = document.querySelector(_selector);
    var selectedGroupIndex = groupSelector.selectedIndex;
    var selectedGroup = groupSelector[selectedGroupIndex].value;
    return selectedGroup;
}
exports.getSelectedGroup = getSelectedGroup;
function createGroupInputForm(e, selectId) {
    var _selectId = selectId ? selectId : 'groupsList';
    function createGroupSelector(groups, selectId) {
        var currentGroup = getGroup();
        var options = '';
        groups.forEach(function (g) {
            var selected = '';
            if (currentGroup == g.id) {
                selected = 'selected';
            }
            options += "<option " + selected + " value=\"" + g.id + "\">" + g.name + "</option>\n";
        });
        var selector = "\n      <select onchange=\"hlib.setSelectedGroup()\" id=\"" + _selectId + "\">\n      " + options + "\n      </select>";
        return selector;
    }
    var token = getToken();
    var opts = {
        method: 'get',
        url: 'https://hypothes.is/api/profile',
        headers: {},
        params: {}
    };
    opts = setApiTokenHeaders(opts, token);
    httpRequest(opts)
        .then(function (data) {
        var _data = data;
        var response = JSON.parse(_data.response);
        var msg = '';
        if (!token) {
            msg = 'add token and refresh to see all groups here';
        }
        var form = "\n        <div class=\"formLabel\">Hypothesis Group</div>\n        <div class=\"inputForm\">" + createGroupSelector(response.groups, _selectId) + "</div>\n        <div class=\"formMessage\">" + msg + "</div>";
        e.innerHTML += form;
    })["catch"](function (e) {
        console.log(e);
    });
}
exports.createGroupInputForm = createGroupInputForm;
function formatTags(tags) {
    var formattedTags = [];
    tags.forEach(function (tag) {
        var formattedTag = "<a target=\"_tag\" href=\"./?tag=" + tag + "\"><span class=\"annotationTag\">" + tag + "</span></a>";
        formattedTags.push(formattedTag);
    });
    return formattedTags.join(' ');
}
exports.formatTags = formatTags;
function csvRow(level, anno) {
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
    fields.push("https://hyp.is/" + anno.id); // add direct link
    fields = fields.map(function (field) {
        if (field) {
            field = field.replace(/&/g, '&amp;'); // the resulting text will be added as html to the dom
            field = field.replace(/</g, '&lt;');
            field = field.replace(/\s+/g, ' '); // normalize whitespace
            field = field.replace(/"/g, '""'); // escape double quotes
            field = field.replace(/\r?\n|\r/g, ' '); // remove cr lf
            field = "\"" + field + "\""; // quote the field
        }
        return field;
    });
    return fields.join(',');
}
exports.csvRow = csvRow;
function showAnnotation(anno, level) {
    var dt = new Date(anno.updated);
    var dt_str = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString().replace(/:\d{2}\s/, ' ');
    var html = anno.text == null ? '' : anno.text;
    var converter = new Showdown.converter();
    html = converter.makeHtml(html);
    var tags = '';
    if (anno.tags.length) {
        tags = formatTags(anno.tags);
    }
    var user = anno.user.replace('acct:', '').replace('@hypothes.is', '');
    var quote = anno.quote;
    if (anno.quote) {
        quote = "<div class=\"annotationQuote\">" + anno.quote + "</div>";
    }
    var standaloneAnnotationUrl = "https://hypothes.is/a/" + anno.id;
    var marginLeft = level * 20;
    var groupSlug = 'in Public';
    if (anno.group !== '__world__') {
        groupSlug = "\n      in group\n      <span class=\"groupid\"><a title=\"search group\" target=\"_group\" href=\"./?group=" + anno.group + "\">" + anno.group + "</a>\n      </span>";
    }
    var output = "\n    <div class=\"annotationCard\" style=\"display:block; margin-left:" + marginLeft + "px;\">\n      <div class=\"csvRow\">" + csvRow(level, anno) + "</div>\n      <div class=\"annotationHeader\">\n        <span class=\"user\">\n        <a title=\"search user\" target=\"_user\"  href=\"./?user=" + user + "\">" + user + "</a>\n        </span>\n      <span class=\"timestamp\"><a title=\"view/edit/reply\"  target=\"_standalone\"\n        href=\"" + standaloneAnnotationUrl + "\">" + dt_str + "</a>\n      </span>\n      " + groupSlug + "\n      </div>\n      <div class=\"annotationBody\">\n        " + quote + "\n        <div>" + html + "</div>\n        <div class=\"annotationTags\">" + tags + "</div>\n      </div>\n    </div>";
    return output;
}
exports.showAnnotation = showAnnotation;
function download(text, type) {
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
exports.download = download;
// https://gist.github.com/monsur/706839
/**
 * XmlHttpRequest's getAllResponseHeaders() method returns a string of response
 * headers according to the format described here:
 * http://www.w3.org/TR/XMLHttpRequest/#the-getallresponseheaders-method
 * This method parses that string into a user-friendly key/value pair object.
 */
function parseResponseHeaders(headerStr) {
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
exports.parseResponseHeaders = parseResponseHeaders;
// functions used by the facet tool
function collapseAll() {
    var togglers = document.querySelectorAll('.urlHeading .toggle');
    togglers.forEach(function (toggler) {
        setToggleControlCollapse(toggler);
    });
    var cards = document.querySelectorAll('.annotationCard');
    hideCards(cards);
}
exports.collapseAll = collapseAll;
function expandAll() {
    var togglers = document.querySelectorAll('.urlHeading .toggle');
    togglers.forEach(function (toggler) {
        setToggleControlExpand(toggler);
    });
    var cards = document.querySelectorAll('.annotationCard');
    showCards(cards);
}
exports.expandAll = expandAll;
function setToggleControlCollapse(toggler) {
    toggler.innerHTML = "\u25B6";
    toggler.title = 'expand';
}
exports.setToggleControlCollapse = setToggleControlCollapse;
function setToggleControlExpand(toggler) {
    toggler.innerHTML = "\u25BC";
    toggler.title = 'collapse';
}
exports.setToggleControlExpand = setToggleControlExpand;
function showCards(cards) {
    for (var i = 0; i < cards.length; i++) {
        cards[i].style.display = 'block';
    }
}
exports.showCards = showCards;
function hideCards(cards) {
    for (var i = 0; i < cards.length; i++) {
        cards[i].style.display = 'none';
    }
}
exports.hideCards = hideCards;
function toggle(id) {
    var heading = getById('heading_' + id);
    var toggler = heading.querySelector('.toggle');
    var cardsId = "cards_" + id;
    var selector = "#" + cardsId + " .annotationCard";
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
exports.toggle = toggle;
