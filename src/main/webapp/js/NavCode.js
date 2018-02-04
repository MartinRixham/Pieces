define(["jquery", "hljs"], function($, hljs) {

	function NavCodeDialog() {

		this.onBind = function(element) {

			$(element).load("html/navCode.html");
		};

		this.navCode =
			new Click(function(element) {

				$(element.firstChild).modal("show");
			});

		this.code =
			new Init(function(element) {

				$(element).load("js/App.js", function() {

					hljs.highlightBlock(element);
				});
			});
	}

	return NavCodeDialog;
});
