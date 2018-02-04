define(["jquery", "hljs"], function($, hljs) {

	function NavCode() {

		var dialog = null;

		this.onBind = function(element) {

			$(element).load("html/navCode.html", function() {

				dialog = element.firstChild;
			});
		};

		this.navCode =
			new Click(function() {

				$(dialog).modal("show");
			});

		this.code =
			new Init(function(element) {

				$(element).load("js/App.js", function() {

					hljs.highlightBlock(element);
				});
			});
	}

	return NavCode;
});
