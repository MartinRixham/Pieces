define([
	"jquery",
	"js/pieces/NavPiece",
	"js/fade/Options",
	"js/fade/Routing",
	"js/fade/Modular",
	"js/fade/Animation",
	"js/fade/Blue",
	"js/Code"],
function(
	$,
	NavPiece,
	Options,
	Routing,
	Modular,
	Animation,
	Blue,
	Code) {

	function Fade() {

		var self = this;

		this.onBind = function(element) {

			$(element).load("html/fade/fade.html");
		};

		function showPage(index) {

			self.content.showPage(index);
		}

		function back() {

			self.content.showPage(0);
		}

		this.content =
			new NavPiece([

				{ route: "", page: new Options(showPage) },
				{ route: "routing", page: new Routing(back) },
				{ route: "modular", page: new Modular(back) },
				{ route: "animation", page: new Animation(back) },
				{ route: "blue", page: new Blue(back) }
			]);

		this.code = new Code("fade/Fade.js");
	}

	return Fade;
});
