requirejs.config({

	paths: {

		jquery: "node_modules/jquery/dist/jquery.min",
		semantic: "node_modules/semantic-ui-offline/semantic.min",
		hljs: "node_modules/highlight.js-postbuild/index",
		Datum: "node_modules/Datum/target/Datum"
	},
	shim: {

		"semantic": { "deps": ["jquery"] }
	}
});

require(["jquery", "js/App", "semantic"], function($, App) {

	$(function() { new Datum.BindingRoot(app = new App()); });
});
