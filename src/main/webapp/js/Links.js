define(["jquery"], function($) {

	function Links() {

		this.onBind = function(element) {

			$(element).load("html/links.html");
		};
	}

	return Links;
});
