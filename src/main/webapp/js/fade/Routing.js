define(["jquery"], function($) {

	function Routing(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/routing.html");
		};

		this.back = new Datum.Click(back);
	}

	return Routing;
});
