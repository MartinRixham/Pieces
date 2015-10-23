requirejs.config({

	baseUrl: "js",
	shim: {

		"semantic": { "deps": ["jquery"] }
	},
	paths: {

		jquery: "../webjars/jquery/3.1.1/jquery.min",
		semantic: "../webjars/Semantic-UI/2.2.2/semantic.min"
	}
});

require(["App", "semantic"], function(App) {

	new BindingRoot(app = new App());
});
