requirejs.config({

	paths: {

		jquery: "node_modules/jquery/dist/jquery.min",
		semantic: "node_modules/semantic-ui-offline/semantic.min",
		hljs: "node_modules/highlight.js-postbuild/index"
	},
	shim: {

		semantic: { deps: ["jquery"] }
	}
});

define("Datum", [], function() {

	return Datum;
});

require(["jquery", "js/App", "semantic"], function($, App) {

	$(function() { new BindingRoot(app = new App()); });
});
