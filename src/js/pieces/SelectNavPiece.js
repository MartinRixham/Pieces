define([
	"./Library",
	"./Route"
], function SelectNavPiece(
	Library,
	Route) {

	function SelectNavPiece(pages) {

		var initialised = false;

		var route;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container;

		this.datumPiecesPages = [];

		this.onBind = function(element) {

			route = Route.get();

			this.datumPiecesPages = [];

			for (var i = 0; i < pages.length; i++) {

				this.datumPiecesPages.push(pages[i].page);
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPages";
			container.appendChild(page);

			element.appendChild(container);

			route.addRoute({

				set: function(word, routeIndex) {

					routePage(word);
					route.update(routeIndex);
				},
				get: function(nonBlank) {

					if (nonBlank && currentIndex < 0) {

						return pages[0].route;
					}
					else if (pages[currentIndex]) {

						return pages[currentIndex].route;
					}
					else {

						return "";
					}
				}
			}, true);
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					currentIndex = i;
					activeIndex(i);

					return;
				}
			}

			initialised = true;
			currentIndex = -1;
			activeIndex(-1);
		}

		this.showPage = function(index) {

			if (!initialised) {

				return;
			}

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return SelectNavPiece;
});
