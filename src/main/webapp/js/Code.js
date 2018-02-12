define(["jquery", "hljs"], function($, hljs) {

	function Code(file) {

		var dialog = null;

		this.onBind = function(element) {

			$(element).load("html/code.html", function() {

				dialog = element.firstChild;
			});
		};

		this.title =
			new Text( function() { return file; });

		this.code =
			new Click(function() {

				$(dialog).modal("show");
			});

		this.text =
			new Init(function(element) {

				$(element).load("js/" + file, function() {

					hljs.highlightBlock(element);
				});
			});
	}

	return Code;
});
