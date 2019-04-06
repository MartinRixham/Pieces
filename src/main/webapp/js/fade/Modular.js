define(["jquery"], function($) {

	function Modular(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/modular.html");
		};

		this.back = new Datum.Click(back);
	}

	return Modular;
});
