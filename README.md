# hlib

JS support for Hypothesis-based projects

Used by:

https://github.com/judell/facet

https://github.com/judell/zotero

https://github.com/judell/HypothesisFootnotes

https://github.com/judell/ContributorFocus

https://github.com/judell/StudentReview

https://github.com/judell/FactCheck

https://github.com/judell/ClaimReview

https://github.com/judell/ClimateFeedbackExport

https://github.com/judell/CrossLink

https://github.com/judell/SingleAnnotationWithReplies

https://github.com/judell/ClinGen
 
https://github.com/judell/CopyAnnotations

https://github.com/judell/HelloWorldAnnotated

https://github.com/judell/AnnotationPoweredSurvey

https://github.com/judell/TagRename

## Setup

In the folder cloned from github:

```
npm install --save-dev webpack@latest
npm install --save-dev webpack-cli@latest
npm install --save-dev source-map-loader@latest
```

## Documentation

http://jonudell.info/hlib/doc/modules/_hlib_.html

## Running tests

1. python server.py

2. Get your API token from https://hypothes.is/account/developer, open localhost:8000, open a browser console and run this:

```
localStorage.setItem('h_token', 'HYPOTHESIS_API_TOKEN');
localStorage.setItem('h_user', 'HYPOTHESIS_USERNAME');
localStorage.setItem('h_subjectUserTokens', JSON.stringify({ HYPOTHESIS_USERNAME: "HYPOTHESIS_API_TOKEN" }));
```

Then:

3. http://localhost:8000/test.html


4. Use `facet` (https://jonudell.info/h/facet) to exercise the library. 

```
git clone https://github.com/judell/facet.git
cd facet
npm install typescript --save-dev
./make.sh dev  # ignore warning about showdown
python server.py

At this point, the setup is something like:

In ~/home/USER/hlib, the library is available at http://localhost:8000

In ~/home/USER/facet, the `facet` app is running on http://localhost:8001, using the library at http://localhost:8000

Open https://localhost:8001 and put `facet` through its paces. 

# Versions

The current version hosted at jonudell.info is https://jonudell.info/hlib/hlib3.bundle.js, and https://github.com/judell/facet is pinned to that version.