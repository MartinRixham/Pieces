define(["jquery"], function($) {

	function Animation(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/animation.html");
		};

		this.back = new Datum.Click(back);
	}

	return Animation;
});
