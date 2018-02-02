requirejs.config({

	baseUrl: "js",
	paths: {

		jquery: "../node_modules/jquery/dist/jquery.min",
		semantic: "../node_modules/semantic-ui-css/semantic.min"
	},
	shim: {

		"semantic": { "deps": ["jquery"] }
	}
});

require(["App", "semantic"], function(App) {

	new BindingRoot(app = new App());
});
