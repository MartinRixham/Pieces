requirejs.config({

	paths: {

		jquery: "node_modules/jquery/dist/jquery.min",
		semantic: "node_modules/semantic-ui-css/semantic.min",
		hljs: "//cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/highlight.min"
	},
	shim: {

		"semantic": { "deps": ["jquery"] }
	}
});

require(["jquery", "js/App", "semantic"], function($, App) {

	$(function() { new BindingRoot(app = new App()); });
});
