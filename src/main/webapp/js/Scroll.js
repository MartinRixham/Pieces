define(["jquery"], function($) {

	function Scroll() {

		this.onBind = function(element) {

			$(element).load("html/scroll.html");
		};
	}

	return Scroll;
});
